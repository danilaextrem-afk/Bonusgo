import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/audit", () => ({ audit: vi.fn(async () => {}) }));
const confirmReferral = vi.fn(async (id: string) => void id);
vi.mock("@/server/loyalty/service", () => ({ confirmReferral: (id: string) => confirmReferral(id) }));

import { db, schema } from "@/server/db";
import { createPaymentOrder } from "@/server/payments/service";
import { claimSbpPayment, confirmSbpPayment, getSbpPayment, rejectSbpPayment } from "@/server/payments/sbp";
import { buildIncomeBody, moscowIso } from "@/server/payments/npd";

const DAY = 86400_000;
const clean = () => db.execute(sql`TRUNCATE payment_events, payments, subscriptions, companies RESTART IDENTITY CASCADE`);
const fetchMock = vi.fn();

beforeEach(async () => {
  await clean();
  confirmReferral.mockClear();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  process.env.PAYMENTS_TEST_MODE = "true";
  process.env.SBP_PHONE = "+70000000000";
  process.env.SBP_BANK = "Т-Банк";
  delete process.env.ROBOKASSA_LOGIN;
  delete process.env.NALOG_INN;
  delete process.env.NALOG_PASSWORD;
});
afterAll(async () => {
  await clean();
  delete process.env.SBP_PHONE;
  vi.unstubAllGlobals();
});

async function company(o: Partial<typeof schema.companies.$inferInsert> = {}) {
  const [c] = await db.insert(schema.companies).values({ name: "Кофейня", country: "RU", currency: "RUB", ...o }).returning();
  return c;
}
const getCompany = async (id: string) => (await db.select().from(schema.companies).where(eq(schema.companies.id, id)))[0];
const getPayment = async (id: string) => (await db.select().from(schema.payments).where(eq(schema.payments.id, id)))[0];

describe("manual SBP payments", () => {
  it("RU checkout uses SBP when no acquiring is configured; amount is server-side and real (not test)", async () => {
    const c = await company();
    const o = await createPaymentOrder(c.id, "PRO", 1);
    expect(o.redirectUrl).toContain(`/app/billing/sbp/${o.paymentId}`);
    const p = await getPayment(o.paymentId);
    expect(p).toMatchObject({ provider: "sbp", amountMinor: 490_00, currency: "RUB", testMode: false, status: "PENDING" });
    const view = await getSbpPayment(c.id, o.paymentId);
    expect(view.code).toBe(`BG-${p.invoiceNo}`);
  });

  it("another company cannot view or claim the payment", async () => {
    const a = await company();
    const b = await company({ name: "Чужая" });
    const o = await createPaymentOrder(a.id, "PRO", 1);
    await expect(getSbpPayment(b.id, o.paymentId)).rejects.toThrow();
    await expect(claimSbpPayment(b.id, o.paymentId, {})).rejects.toThrow();
  });

  it("claim grants a 3-day grace; confirm gives the full period from the pre-claim state", async () => {
    const c = await company();
    const o = await createPaymentOrder(c.id, "PRO", 1);
    const r = await claimSbpPayment(c.id, o.paymentId, {});
    expect(r).toMatchObject({ claimed: true, grace: true });
    const grace = await getCompany(c.id);
    expect(grace.plan).toBe("PRO");
    expect((grace.planExpiresAt!.getTime() - Date.now()) / DAY).toBeCloseTo(3, 0);

    const conf = await confirmSbpPayment(o.paymentId, "admin");
    expect(conf.changed).toBe(true);
    expect(conf.receipt).toMatchObject({ ok: false, error: "not_configured" });
    const paid = await getCompany(c.id);
    const days = (paid.planExpiresAt!.getTime() - Date.now()) / DAY;
    expect(days).toBeGreaterThan(27);
    expect(days).toBeLessThan(32); // grace days are not added on top
    expect(confirmReferral).toHaveBeenCalledWith(c.id);
    expect((await confirmSbpPayment(o.paymentId, "admin")).changed).toBe(false); // idempotent
  });

  it("double claim is a no-op and does not extend grace", async () => {
    const c = await company();
    const o = await createPaymentOrder(c.id, "PRO", 1);
    await claimSbpPayment(c.id, o.paymentId, {});
    const first = (await getCompany(c.id)).planExpiresAt!.getTime();
    await claimSbpPayment(c.id, o.paymentId, {}, new Date(Date.now() + DAY));
    expect((await getCompany(c.id)).planExpiresAt!.getTime()).toBe(first);
  });

  it("reject restores the previous plan; after a rejection no instant grace is given", async () => {
    const c = await company();
    const o = await createPaymentOrder(c.id, "PRO", 1);
    await claimSbpPayment(c.id, o.paymentId, {});
    await rejectSbpPayment(o.paymentId, "admin");
    expect(await getCompany(c.id)).toMatchObject({ plan: "FREE", planExpiresAt: null });
    expect(await getPayment(o.paymentId)).toMatchObject({ status: "FAILED", failReason: "sbp_rejected" });

    const o2 = await createPaymentOrder(c.id, "PRO", 1);
    const r2 = await claimSbpPayment(c.id, o2.paymentId, {});
    expect(r2.grace).toBe(false);
    expect((await getCompany(c.id)).plan).toBe("FREE");
  });

  it("renewal stacks on an active same plan without granting grace", async () => {
    const until = new Date(Date.now() + 20 * DAY);
    const c = await company({ plan: "PRO", planExpiresAt: until });
    const o = await createPaymentOrder(c.id, "PRO", 1);
    expect((await claimSbpPayment(c.id, o.paymentId, {})).grace).toBe(false);
    await confirmSbpPayment(o.paymentId, "admin");
    const days = ((await getCompany(c.id)).planExpiresAt!.getTime() - Date.now()) / DAY;
    expect(days).toBeGreaterThan(47);
  });

  it("rejects an invalid payer INN", async () => {
    const c = await company();
    const o = await createPaymentOrder(c.id, "PRO", 1);
    await expect(claimSbpPayment(c.id, o.paymentId, { inn: "123" })).rejects.toThrow(/ИНН/);
  });

  it("issues an НПД receipt for a legal-entity payer when credentials are set", async () => {
    process.env.NALOG_INN = "000000000000";
    process.env.NALOG_PASSWORD = "x";
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: "t", tokenExpireIn: new Date(Date.now() + 3600_000).toISOString() })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ approvedReceiptUuid: "rcpt-1" })));
    const c = await company();
    const o = await createPaymentOrder(c.id, "TOP", 1);
    await claimSbpPayment(c.id, o.paymentId, { inn: "7700000000", name: "ООО Ромашка" });
    const conf = await confirmSbpPayment(o.paymentId, "admin");
    expect(conf.receipt).toEqual({ ok: true, id: "rcpt-1" });
    const body = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(body).toMatchObject({ totalAmount: "990.00", client: { incomeType: "FROM_LEGAL_ENTITY", inn: "7700000000", displayName: "ООО Ромашка" } });
    expect(fetchMock.mock.calls[1][1].headers.authorization).toBe("Bearer t");
    expect((await getPayment(o.paymentId)).npdReceiptId).toBe("rcpt-1");
  });

  it("receipt failure keeps the payment PAID and records the error", async () => {
    process.env.NALOG_INN = "000000000000";
    process.env.NALOG_PASSWORD = "x";
    fetchMock.mockResolvedValue(new Response("down", { status: 503 }));
    const c = await company();
    const o = await createPaymentOrder(c.id, "PRO", 1);
    await claimSbpPayment(c.id, o.paymentId, {});
    const conf = await confirmSbpPayment(o.paymentId, "admin");
    expect(conf.receipt?.ok).toBe(false);
    const p = await getPayment(o.paymentId);
    expect(p.status).toBe("PAID");
    expect(p.npdError).toMatch(/503/);
  });
});

describe("НПД receipt body", () => {
  it("formats Moscow time and individual client", () => {
    expect(moscowIso(new Date("2026-11-18T19:05:00Z"))).toBe("2026-11-18T22:05:00+03:00");
    const b = buildIncomeBody({ serviceName: "Подписка", amountMinor: 990_00, operationTime: new Date("2026-11-18T19:05:00Z"), client: { type: "FROM_INDIVIDUAL" } });
    expect(b).toMatchObject({ totalAmount: "990.00", services: [{ amount: 990, quantity: 1 }], client: { incomeType: "FROM_INDIVIDUAL", inn: null }, paymentType: "ACCOUNT" });
  });
});
