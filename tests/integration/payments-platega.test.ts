import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/audit", () => ({ audit: vi.fn(async () => {}) }));
vi.mock("@/server/loyalty/service", () => ({ confirmReferral: vi.fn(async () => {}) }));

import { db, schema } from "@/server/db";
import { createId } from "@/server/id";
import { platega } from "@/server/payments/platega";
import { createPaymentOrder } from "@/server/payments/service";
import { POST as callback } from "@/app/api/payments/platega/callback/route";

const clean = () => db.execute(sql`TRUNCATE payment_events, payments, subscriptions, companies RESTART IDENTITY CASCADE`);
const fetchMock = vi.fn();
const MID = "11111111-1111-1111-1111-111111111111";
const SECRET = "platega-secret";
const TRANSACTION_ID = "22222222-2222-4222-8222-222222222222";
const PAYER = { id: createId(), email: "merchant@example.test" };
const CHECKOUT_KEY = "33333333-3333-4333-8333-333333333333";

beforeEach(async () => {
  await clean();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  Object.assign(process.env, {
    PLATEGA_MERCHANT_ID: MID, PLATEGA_SECRET: SECRET, PLATEGA_LIVE_ENABLED: "true", PLATEGA_SELLER_PAYS_FEE: "true",
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
  delete process.env.PLATEGA_SELLER_PAYS_FEE;
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
  const o = await createPaymentOrder(c.id, "PRO", 1, PAYER, CHECKOUT_KEY);
  const [p] = await db.select().from(schema.payments).where(eq(schema.payments.id, o.paymentId));
  return { c, o, p };
}

describe("Platega", () => {
  it("creates an SBP transaction with provider-generated UUID, buyer email and return URLs", async () => {
    const { o, p } = await checkout();
    expect(o.redirectUrl).toBe("https://pay.platega.io/?qrsbp=1");
    expect(p).toMatchObject({ provider: "platega", amountMinor: 490_00, testMode: false });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://app.platega.io/transaction/process");
    expect(init.headers).toMatchObject({ "X-MerchantId": MID, "X-Secret": SECRET });
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ paymentMethod: 2, paymentDetails: { amount: 490, currency: "RUB" }, return: "https://qronus.example/app/billing?status=success", metadata: { userId: PAYER.id, user_email: PAYER.email } });
    expect(body).not.toHaveProperty("id");
    expect(init.redirect).toBe("error");
    expect(p.providerRef).toBe(TRANSACTION_ID);
  });

  it.each([[1, 990], [3, 2970], [12, 9900]] as const)(
    "charges the correct TOP price for %i months within the Platega limit",
    async (months, amount) => {
      const c = await company();
      fetchMock.mockResolvedValueOnce(json({ transactionId: TRANSACTION_ID, redirect: "https://pay.platega.io/checkout" }));
      const order = await createPaymentOrder(c.id, "TOP", months, PAYER, CHECKOUT_KEY);
      const [payment] = await db.select().from(schema.payments).where(eq(schema.payments.id, order.paymentId));
      expect(payment).toMatchObject({ amountMinor: amount * 100, currency: "RUB", months });
      expect(JSON.parse(fetchMock.mock.calls[0][1].body).paymentDetails).toEqual({ amount, currency: "RUB" });
    },
  );

  it("refuses live payment when legal/support readiness is incomplete", async () => {
    delete process.env.CONTACT_EMAIL;
    const c = await company();
    await expect(createPaymentOrder(c.id, "PRO", 1, PAYER, CHECKOUT_KEY)).rejects.toMatchObject({ code: "payments_unavailable" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an untrusted checkout redirect and fails the order", async () => {
    const c = await company();
    fetchMock.mockResolvedValueOnce(json({ transactionId: TRANSACTION_ID, redirect: "https://malicious.example/pay" }));
    await expect(createPaymentOrder(c.id, "PRO", 1, PAYER, CHECKOUT_KEY)).rejects.toMatchObject({ code: "provider_error" });
    const payments = await db.select().from(schema.payments).where(eq(schema.payments.companyId, c.id));
    expect(payments).toHaveLength(1);
    expect(payments[0].status).toBe("FAILED");
  });

  it("reuses a completed checkout and holds concurrent retries on the same request key", async () => {
    const c = await company();
    let finish!: (response: Response) => void;
    let started!: () => void;
    const upstreamStarted = new Promise<void>((resolve) => { started = resolve; });
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => { finish = resolve; started(); }));

    const first = createPaymentOrder(c.id, "PRO", 1, PAYER, CHECKOUT_KEY);
    await upstreamStarted;
    try {
      await expect(createPaymentOrder(c.id, "PRO", 1, PAYER, CHECKOUT_KEY)).rejects.toMatchObject({ code: "checkout_in_progress" });
      await expect(createPaymentOrder(c.id, "PRO", 3, PAYER, CHECKOUT_KEY)).rejects.toMatchObject({ code: "checkout_conflict" });
    } finally {
      finish(json({ transactionId: TRANSACTION_ID, redirect: "https://pay.platega.io/?qrsbp=1" }));
    }
    const order = await first;
    await expect(createPaymentOrder(c.id, "PRO", 1, PAYER, CHECKOUT_KEY)).resolves.toEqual(order);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await db.select().from(schema.payments)).toHaveLength(1);
  });

  it("does not try a second provider charge after an ambiguous start", async () => {
    const c = await company();
    fetchMock.mockRejectedValueOnce(new Error("network timeout"));
    await expect(createPaymentOrder(c.id, "PRO", 1, PAYER, CHECKOUT_KEY)).rejects.toThrow("network timeout");
    await expect(createPaymentOrder(c.id, "PRO", 1, PAYER, CHECKOUT_KEY)).rejects.toMatchObject({ code: "checkout_in_progress" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("enforces exactly 10 000 RUB at the adapter boundary", async () => {
    const { c, p } = await checkout();
    fetchMock.mockResolvedValueOnce(json({ transactionId: TRANSACTION_ID, redirect: "https://pay.platega.io/checkout" }));
    await expect(platega.createCheckout({ ...p, amountMinor: 1_000_000 }, c, PAYER)).resolves.toMatchObject({ redirectUrl: "https://pay.platega.io/checkout" });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).paymentDetails).toEqual({ amount: 10_000, currency: "RUB" });
    await expect(platega.createCheckout({ ...p, amountMinor: 1_000_001 }, c, PAYER)).rejects.toMatchObject({ code: "platega_amount_limit" });
    await expect(platega.createCheckout({ ...p, currency: "BYN" }, c, PAYER)).rejects.toMatchObject({ code: "platega_amount_limit" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns a retryable failure on provider outages and rejects a null callback body", async () => {
    const { p } = await checkout();
    expect((await cb(null)).status).toBe(400);
    fetchMock.mockResolvedValueOnce(json({}, 503));
    expect((await cb({ id: p.providerRef })).status).toBe(500);
    expect((await db.select().from(schema.payments).where(eq(schema.payments.id, p.id)))[0].status).toBe("PENDING");
  });

  it("keeps an early full reversal terminal when a delayed confirmation arrives", async () => {
    const { c, p } = await checkout();
    for (const status of ["CHARGEBACKED", "CONFIRMED"]) {
      fetchMock.mockResolvedValueOnce(json({ id: p.providerRef, status, paymentDetails: { amount: 490, currency: "RUB" } }));
      expect((await cb({ id: p.providerRef })).status).toBe(200);
    }
    expect((await db.select().from(schema.companies).where(eq(schema.companies.id, c.id)))[0].plan).toBe("FREE");
    expect((await db.select().from(schema.payments).where(eq(schema.payments.id, p.id)))[0].status).toBe("REFUNDED");
  });

  it("rejects callbacks with wrong credentials", async () => {
    const { p } = await checkout();
    const r = await cb({ id: p.providerRef, status: "CONFIRMED" }, { "X-MerchantId": MID, "X-Secret": "wrong" });
    expect(r.status).toBe(401);
  });

  it("activates the plan only after re-reading CONFIRMED status from the API; duplicates are no-ops", async () => {
    const { c, p } = await checkout();
    fetchMock.mockImplementation(async () => json({ id: p.providerRef, status: "CONFIRMED", paymentDetails: { amount: 490, currency: "RUB" } }));
    const replies = await Promise.all([
      cb({ id: p.providerRef, status: "CONFIRMED" }),
      cb({ id: p.providerRef, status: "CONFIRMED" }),
    ]);
    expect(replies.map((reply) => reply.status)).toEqual([200, 200]);
    const [after] = await db.select().from(schema.companies).where(eq(schema.companies.id, c.id));
    expect(after.plan).toBe("PRO");
    expect(await db.select().from(schema.paymentEvents)).toHaveLength(1);
    expect(fetchMock.mock.calls[1][0]).toBe(`https://app.platega.io/transaction/${p.providerRef}`);
  });

  it("ignores a forged CONFIRMED callback when the API says the payment is still pending", async () => {
    const { c, p } = await checkout();
    fetchMock.mockImplementation(async () => json({ id: p.providerRef, status: "PENDING", paymentDetails: { amount: 490, currency: "RUB" } }));
    await cb({ id: p.providerRef, status: "CONFIRMED", amount: 490 });
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

  it("does not round a provider amount with three fractional digits into a valid payment", async () => {
    const { c, p } = await checkout();
    fetchMock.mockImplementation(async () => json({
      id: p.providerRef, status: "CONFIRMED", paymentDetails: { amount: 490.001, currency: "RUB" },
    }));
    expect((await cb({ id: p.providerRef })).status).toBe(200);
    expect((await db.select().from(schema.companies).where(eq(schema.companies.id, c.id)))[0].plan).toBe("FREE");
    expect((await db.select().from(schema.payments).where(eq(schema.payments.id, p.id)))[0].status).toBe("PENDING");
    expect(await db.select().from(schema.paymentEvents)).toHaveLength(0);
  });

  it("marks canceled payments as FAILED", async () => {
    const { p } = await checkout();
    fetchMock.mockImplementation(async () => json({ id: p.providerRef, status: "CANCELED", paymentDetails: { amount: 490, currency: "RUB" } }));
    await cb({ id: p.providerRef });
    const [after] = await db.select().from(schema.payments).where(eq(schema.payments.id, p.id));
    expect(after).toMatchObject({ status: "FAILED", failReason: "platega_canceled" });
  });

  it("accepts verified CONFIRMED after a prior Platega cancellation, exactly once", async () => {
    const { c, p } = await checkout();
    fetchMock.mockImplementation(async () => json({ id: p.providerRef, status: "CANCELED", paymentDetails: { amount: 490, currency: "RUB" } }));
    expect((await cb({ id: p.providerRef })).status).toBe(200);
    expect((await db.select().from(schema.companies).where(eq(schema.companies.id, c.id)))[0].plan).toBe("FREE");
    expect((await db.select().from(schema.payments).where(eq(schema.payments.id, p.id)))[0].status).toBe("FAILED");

    fetchMock.mockImplementation(async () => json({ id: p.providerRef, status: "CONFIRMED", paymentDetails: { amount: 490, currency: "RUB" } }));
    expect((await cb({ id: p.providerRef })).status).toBe(200);
    expect((await cb({ id: p.providerRef })).status).toBe(200);
    expect((await db.select().from(schema.companies).where(eq(schema.companies.id, c.id)))[0].plan).toBe("PRO");
    expect((await db.select().from(schema.payments).where(eq(schema.payments.id, p.id)))[0].status).toBe("PAID");
    expect(await db.select().from(schema.paymentEvents).where(eq(schema.paymentEvents.paymentId, p.id))).toHaveLength(2);
  });

  it("handles provider-verified full CHARGEBACKED as a single reversal of a paid plan", async () => {
    const { c, p } = await checkout();
    fetchMock.mockImplementation(async () => json({ id: p.providerRef, status: "CONFIRMED", paymentDetails: { amount: 490, currency: "RUB" } }));
    await cb({ id: p.providerRef });
    expect((await db.select().from(schema.companies).where(eq(schema.companies.id, c.id)))[0].plan).toBe("PRO");

    fetchMock.mockImplementation(async () => json({ id: p.providerRef, status: "CHARGEBACKED", paymentDetails: { amount: 490, currency: "RUB" } }));
    expect((await cb({ id: p.providerRef })).status).toBe(200);
    expect((await cb({ id: p.providerRef })).status).toBe(200);
    expect((await db.select().from(schema.payments).where(eq(schema.payments.id, p.id)))[0].status).toBe("REFUNDED");
    expect((await db.select().from(schema.companies).where(eq(schema.companies.id, c.id)))[0].plan).toBe("FREE");
    expect(await db.select().from(schema.paymentEvents).where(eq(schema.paymentEvents.paymentId, p.id))).toHaveLength(2);
  });

  it("ignores disputed and partial-refund statuses without falsely issuing or revoking access", async () => {
    const { c, p } = await checkout();
    for (const status of ["DISPUTED", "PARTIALLY_REFUNDED"]) {
      fetchMock.mockImplementation(async () => json({ id: p.providerRef, status, paymentDetails: { amount: 490, currency: "RUB" } }));
      expect((await cb({ id: p.providerRef })).status).toBe(200);
      expect((await db.select().from(schema.companies).where(eq(schema.companies.id, c.id)))[0].plan).toBe("FREE");
    }
    expect(await db.select().from(schema.paymentEvents)).toHaveLength(0);
  });

  it("issues the НПД receipt automatically after payment when Мой налог is configured", async () => {
    const { p } = await checkout();
    Object.assign(process.env, { NALOG_INN: "000000000000", NALOG_PASSWORD: "x" });
    fetchMock
      .mockResolvedValueOnce(json({ id: p.providerRef, status: "CONFIRMED", paymentDetails: { amount: 490, currency: "RUB" } }))
      .mockResolvedValueOnce(json({ token: "t", tokenExpireIn: new Date(Date.now() + 3600_000).toISOString() }))
      .mockResolvedValueOnce(json({ approvedReceiptUuid: "rcpt-platega" }));
    await cb({ id: p.providerRef });
    const [after] = await db.select().from(schema.payments).where(eq(schema.payments.id, p.id));
    expect(after).toMatchObject({ status: "PAID", npdReceiptId: "rcpt-platega" });
    delete process.env.NALOG_PASSWORD;
  });
});
