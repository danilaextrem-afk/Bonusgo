import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/audit", () => ({ audit: vi.fn(async () => {}) }));
vi.mock("@/server/loyalty/service", () => ({ confirmReferral: vi.fn(async () => {}) }));

import { db, schema } from "@/server/db";
import { createPaymentOrder } from "@/server/payments/service";
import { POST as callback } from "@/app/api/payments/platega/callback/route";

const clean = () => db.execute(sql`TRUNCATE payment_events, payments, subscriptions, companies RESTART IDENTITY CASCADE`);
const fetchMock = vi.fn();
const MID = "11111111-1111-1111-1111-111111111111";
const SECRET = "platega-secret";
const TRANSACTION_ID = "22222222-2222-4222-8222-222222222222";
const PAYER = { id: "33333333-3333-4333-8333-333333333333", email: "merchant@example.test" };

beforeEach(async () => {
  await clean();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  Object.assign(process.env, {
    PLATEGA_MERCHANT_ID: MID, PLATEGA_SECRET: SECRET, PLATEGA_LIVE_ENABLED: "true",
    PAYMENTS_TEST_MODE: "false", DEMO_MODE: "false", CONTACT_EMAIL: "support@example.test",
    OWNER_NAME: "Тестовый оператор", OWNER_TAX_ID: "000000000000", OWNER_ADDRESS: "Тестовый адрес",
    APP_URL: "https://qronus.example",
  });
  delete process.env.ROBOKASSA_LOGIN;
  delete process.env.NALOG_INN;
});
afterAll(async () => {
  await clean();
  delete process.env.PLATEGA_MERCHANT_ID;
  delete process.env.PLATEGA_SECRET;
  delete process.env.PLATEGA_LIVE_ENABLED;
  delete process.env.CONTACT_EMAIL;
  delete process.env.OWNER_NAME;
  delete process.env.OWNER_TAX_ID;
  delete process.env.OWNER_ADDRESS;
  vi.unstubAllGlobals();
});

async function company() {
  const [c] = await db.insert(schema.companies).values({ name: "Автомойка", country: "RU", currency: "RUB" }).returning();
  return c;
}
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
const cb = (body: unknown, h: Record<string, string> = { "X-MerchantId": MID, "X-Secret": SECRET }) =>
  callback(new Request("https://qronus.example/api/payments/platega/callback", { method: "POST", headers: { "content-type": "application/json", ...h }, body: JSON.stringify(body) }));

async function checkout() {
  const c = await company();
  fetchMock.mockResolvedValueOnce(json({ transactionId: TRANSACTION_ID, redirect: "https://pay.platega.io/?qrsbp=1", status: "PENDING" }));
  const o = await createPaymentOrder(c.id, "PRO", 1, PAYER);
  const [p] = await db.select().from(schema.payments).where(eq(schema.payments.id, o.paymentId));
  return { c, o, p };
}

describe("Platega", () => {
  it("creates an SBP transaction with provider-generated UUID, buyer email and return URLs", async () => {
    const { o, p } = await checkout();
    expect(o.redirectUrl).toBe("https://pay.platega.io/?qrsbp=1");
    expect(p).toMatchObject({ provider: "platega", amountMinor: 990_00, testMode: false });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://app.platega.io/transaction/process");
    expect(init.headers).toMatchObject({ "X-MerchantId": MID, "X-Secret": SECRET });
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ paymentMethod: 2, paymentDetails: { amount: 990, currency: "RUB" }, return: "https://qronus.example/app/billing?status=success", metadata: { userId: PAYER.id, user_email: PAYER.email } });
    expect(body).not.toHaveProperty("id");
    expect(p.providerRef).toBe(TRANSACTION_ID);
  });

  it("rejects TOP 3/12-month purchases above 10 000 RUB before creating an order", async () => {
    const c = await company();
    await expect(createPaymentOrder(c.id, "TOP", 3, PAYER)).rejects.toMatchObject({ code: "platega_amount_limit" });
    await expect(createPaymentOrder(c.id, "TOP", 12, PAYER)).rejects.toMatchObject({ code: "platega_amount_limit" });
    expect(await db.select().from(schema.payments).where(eq(schema.payments.companyId, c.id))).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses live payment when legal/support readiness is incomplete", async () => {
    delete process.env.CONTACT_EMAIL;
    const c = await company();
    await expect(createPaymentOrder(c.id, "PRO", 1, PAYER)).rejects.toMatchObject({ code: "payments_unavailable" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an untrusted checkout redirect and fails the order", async () => {
    const c = await company();
    fetchMock.mockResolvedValueOnce(json({ transactionId: TRANSACTION_ID, redirect: "https://malicious.example/pay" }));
    await expect(createPaymentOrder(c.id, "PRO", 1, PAYER)).rejects.toMatchObject({ code: "provider_error" });
    const payments = await db.select().from(schema.payments).where(eq(schema.payments.companyId, c.id));
    expect(payments).toHaveLength(1);
    expect(payments[0].status).toBe("FAILED");
  });

  it("rejects callbacks with wrong credentials", async () => {
    const { p } = await checkout();
    const r = await cb({ id: p.providerRef, status: "CONFIRMED" }, { "X-MerchantId": MID, "X-Secret": "wrong" });
    expect(r.status).toBe(401);
  });

  it("activates the plan only after re-reading CONFIRMED status from the API; duplicates are no-ops", async () => {
    const { c, p } = await checkout();
    fetchMock.mockImplementation(async () => json({ id: p.providerRef, status: "CONFIRMED", paymentDetails: { amount: 990, currency: "RUB" } }));
    expect((await cb({ id: p.providerRef, status: "CONFIRMED" })).status).toBe(200);
    expect((await cb({ id: p.providerRef, status: "CONFIRMED" })).status).toBe(200);
    const [after] = await db.select().from(schema.companies).where(eq(schema.companies.id, c.id));
    expect(after.plan).toBe("PRO");
    expect(await db.select().from(schema.paymentEvents)).toHaveLength(1);
    expect(fetchMock.mock.calls[1][0]).toBe(`https://app.platega.io/transaction/${p.providerRef}`);
  });

  it("ignores a forged CONFIRMED callback when the API says the payment is still pending", async () => {
    const { c, p } = await checkout();
    fetchMock.mockImplementation(async () => json({ id: p.providerRef, status: "PENDING", paymentDetails: { amount: 990, currency: "RUB" } }));
    await cb({ id: p.providerRef, status: "CONFIRMED", amount: 990 });
    const [after] = await db.select().from(schema.companies).where(eq(schema.companies.id, c.id));
    expect(after.plan).toBe("FREE");
  });

  it("does not activate when the confirmed amount is lower than the order", async () => {
    const { c, p } = await checkout();
    fetchMock.mockImplementation(async () => json({ id: p.providerRef, status: "CONFIRMED", paymentDetails: { amount: 1, currency: "RUB" } }));
    await cb({ id: p.providerRef });
    const [after] = await db.select().from(schema.companies).where(eq(schema.companies.id, c.id));
    expect(after.plan).toBe("FREE");
  });

  it("marks canceled payments as FAILED", async () => {
    const { p } = await checkout();
    fetchMock.mockImplementation(async () => json({ id: p.providerRef, status: "CANCELED", paymentDetails: { amount: 990, currency: "RUB" } }));
    await cb({ id: p.providerRef });
    const [after] = await db.select().from(schema.payments).where(eq(schema.payments.id, p.id));
    expect(after).toMatchObject({ status: "FAILED", failReason: "platega_canceled" });
  });

  it("accepts verified CONFIRMED after a prior Platega cancellation, exactly once", async () => {
    const { c, p } = await checkout();
    fetchMock.mockImplementation(async () => json({ id: p.providerRef, status: "CANCELED", paymentDetails: { amount: 990, currency: "RUB" } }));
    expect((await cb({ id: p.providerRef })).status).toBe(200);
    expect((await db.select().from(schema.companies).where(eq(schema.companies.id, c.id)))[0].plan).toBe("FREE");
    expect((await db.select().from(schema.payments).where(eq(schema.payments.id, p.id)))[0].status).toBe("FAILED");

    fetchMock.mockImplementation(async () => json({ id: p.providerRef, status: "CONFIRMED", paymentDetails: { amount: 990, currency: "RUB" } }));
    expect((await cb({ id: p.providerRef })).status).toBe(200);
    expect((await cb({ id: p.providerRef })).status).toBe(200);
    expect((await db.select().from(schema.companies).where(eq(schema.companies.id, c.id)))[0].plan).toBe("PRO");
    expect((await db.select().from(schema.payments).where(eq(schema.payments.id, p.id)))[0].status).toBe("PAID");
    expect(await db.select().from(schema.paymentEvents).where(eq(schema.paymentEvents.paymentId, p.id))).toHaveLength(2);
  });

  it("handles provider-verified full CHARGEBACKED as a single reversal of a paid plan", async () => {
    const { c, p } = await checkout();
    fetchMock.mockImplementation(async () => json({ id: p.providerRef, status: "CONFIRMED", paymentDetails: { amount: 990, currency: "RUB" } }));
    await cb({ id: p.providerRef });
    expect((await db.select().from(schema.companies).where(eq(schema.companies.id, c.id)))[0].plan).toBe("PRO");

    fetchMock.mockImplementation(async () => json({ id: p.providerRef, status: "CHARGEBACKED", paymentDetails: { amount: 990, currency: "RUB" } }));
    expect((await cb({ id: p.providerRef })).status).toBe(200);
    expect((await cb({ id: p.providerRef })).status).toBe(200);
    expect((await db.select().from(schema.payments).where(eq(schema.payments.id, p.id)))[0].status).toBe("REFUNDED");
    expect((await db.select().from(schema.companies).where(eq(schema.companies.id, c.id)))[0].plan).toBe("FREE");
    expect(await db.select().from(schema.paymentEvents).where(eq(schema.paymentEvents.paymentId, p.id))).toHaveLength(2);
  });

  it("ignores disputed and partial-refund statuses without falsely issuing or revoking access", async () => {
    const { c, p } = await checkout();
    for (const status of ["DISPUTED", "PARTIALLY_REFUNDED"]) {
      fetchMock.mockImplementation(async () => json({ id: p.providerRef, status, paymentDetails: { amount: 990, currency: "RUB" } }));
      expect((await cb({ id: p.providerRef })).status).toBe(200);
      expect((await db.select().from(schema.companies).where(eq(schema.companies.id, c.id)))[0].plan).toBe("FREE");
    }
    expect(await db.select().from(schema.paymentEvents)).toHaveLength(0);
  });

  it("issues the НПД receipt automatically after payment when Мой налог is configured", async () => {
    const { p } = await checkout();
    Object.assign(process.env, { NALOG_INN: "000000000000", NALOG_PASSWORD: "x" });
    fetchMock
      .mockResolvedValueOnce(json({ id: p.providerRef, status: "CONFIRMED", paymentDetails: { amount: 990, currency: "RUB" } }))
      .mockResolvedValueOnce(json({ token: "t", tokenExpireIn: new Date(Date.now() + 3600_000).toISOString() }))
      .mockResolvedValueOnce(json({ approvedReceiptUuid: "rcpt-platega" }));
    await cb({ id: p.providerRef });
    const [after] = await db.select().from(schema.payments).where(eq(schema.payments.id, p.id));
    expect(after).toMatchObject({ status: "PAID", npdReceiptId: "rcpt-platega" });
    delete process.env.NALOG_PASSWORD;
  });
});
