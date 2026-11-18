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

beforeEach(async () => {
  await clean();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  Object.assign(process.env, { PLATEGA_MERCHANT_ID: MID, PLATEGA_SECRET: SECRET, PAYMENTS_TEST_MODE: "false", APP_URL: "https://qronus.example" });
  delete process.env.ROBOKASSA_LOGIN;
  delete process.env.NALOG_INN;
});
afterAll(async () => {
  await clean();
  delete process.env.PLATEGA_MERCHANT_ID;
  delete process.env.PLATEGA_SECRET;
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
  fetchMock.mockResolvedValueOnce(json({ transactionId: null, redirect: "https://pay.platega.io/?qrsbp=1", status: "PENDING" }));
  const o = await createPaymentOrder(c.id, "PRO", 1);
  const [p] = await db.select().from(schema.payments).where(eq(schema.payments.id, o.paymentId));
  return { c, o, p };
}

describe("Platega", () => {
  it("creates an SBP transaction server-side with our UUID, amount and return URLs", async () => {
    const { o, p } = await checkout();
    expect(o.redirectUrl).toBe("https://pay.platega.io/?qrsbp=1");
    expect(p).toMatchObject({ provider: "platega", amountMinor: 990_00, testMode: false });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://app.platega.io/transaction/process");
    expect(init.headers).toMatchObject({ "X-MerchantId": MID, "X-Secret": SECRET });
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ paymentMethod: 2, id: p.providerRef, paymentDetails: { amount: 990, currency: "RUB" }, return: "https://qronus.example/app/billing?status=success" });
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
