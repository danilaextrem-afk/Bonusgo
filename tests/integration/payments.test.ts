import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/audit", () => ({ audit: vi.fn(async () => {}) }));
const confirmReferral = vi.fn(async (_id: string) => {});
vi.mock("@/server/loyalty/service", () => ({ confirmReferral: (id: string) => confirmReferral(id) }));

import { audit } from "@/server/audit";
import { db, schema } from "@/server/db";
import { addMonths, createPaymentOrder, expireSubscriptions, getPaymentDiagnostics, processNotification, cancelSubscription } from "@/server/payments/service";

const DAY = 86400_000;
const clean = () => db.execute(sql`TRUNCATE payment_events, payments, subscriptions, companies RESTART IDENTITY CASCADE`);
beforeEach(async () => {
  await clean();
  confirmReferral.mockClear();
  vi.mocked(audit).mockClear();
  process.env.PAYMENTS_TEST_MODE = "true";
  delete process.env.ROBOKASSA_LOGIN;
});
afterAll(clean);

async function company(o: Partial<typeof schema.companies.$inferInsert> = {}) {
  const [c] = await db.insert(schema.companies).values({ name: "T", country: "RU", currency: "RUB", ...o }).returning();
  return c;
}
async function order(companyId: string, plan: "PRO" | "TOP" = "PRO", months: 1 | 3 | 12 = 1) {
  const o = await createPaymentOrder(companyId, plan, months);
  const [p] = await db.select().from(schema.payments).where(eq(schema.payments.id, o.paymentId));
  return { o, p };
}
const note = (p: { invoiceNo: number; amountMinor: number }, kind: "paid" | "failed" | "refunded" = "paid", amountMinor = p.amountMinor) =>
  processNotification("mock", { ok: true, invoiceNo: p.invoiceNo, amountMinor, kind, raw: {} });
const getCompany = async (id: string) => (await db.select().from(schema.companies).where(eq(schema.companies.id, id)))[0];

describe("payments pipeline", () => {
  it("creates a PENDING order with server-side amount and mock redirect", async () => {
    const c = await company();
    const { o, p } = await order(c.id, "TOP", 12);
    expect(p).toMatchObject({ status: "PENDING", amountMinor: 4890_00 * 10, currency: "RUB", provider: "mock", months: 12 });
    expect(o.redirectUrl).toContain(`/api/payments/mock/complete?invoice=${p.invoiceNo}&sig=`);
    const by = await company({ country: "BY", currency: "BYN" });
    expect((await order(by.id, "PRO", 3)).p).toMatchObject({ amountMinor: 35_00 * 3, currency: "BYN" });
  });

  it("refuses checkout when no provider is available (no test mode, unconfigured)", async () => {
    process.env.PAYMENTS_TEST_MODE = "false";
    const c = await company();
    await expect(createPaymentOrder(c.id, "PRO", 1)).rejects.toThrow();
  });

  it("PAID activates a fresh plan, creates subscription, confirms referral", async () => {
    const c = await company();
    const { p } = await order(c.id, "PRO", 3);
    const r = await note(p);
    expect(r).toMatchObject({ ok: true, status: "PAID" });
    const after = await getCompany(c.id);
    expect(after.plan).toBe("PRO");
    const days = (after.planExpiresAt!.getTime() - Date.now()) / DAY;
    expect(days).toBeGreaterThan(88);
    expect(days).toBeLessThan(93);
    const subs = await db.select().from(schema.subscriptions).where(eq(schema.subscriptions.companyId, c.id));
    expect(subs).toHaveLength(1);
    expect(subs[0]).toMatchObject({ status: "ACTIVE", plan: "PRO", provider: "mock" });
    expect(confirmReferral).toHaveBeenCalledWith(c.id);
  });

  it("stacks from existing expiry for the same plan, restarts from now for a different plan", async () => {
    const expiry = new Date(Date.now() + 10 * DAY);
    const c = await company({ plan: "PRO", planExpiresAt: expiry });
    const { p } = await order(c.id, "PRO", 1);
    await note(p);
    const stacked = await getCompany(c.id);
    expect(stacked.planExpiresAt!.getTime()).toBe(addMonths(expiry, 1).getTime());
    const { p: p2 } = await order(c.id, "TOP", 1);
    await note(p2);
    const top = await getCompany(c.id);
    expect(top.plan).toBe("TOP");
    expect((top.planExpiresAt!.getTime() - Date.now()) / DAY).toBeLessThan(32);
  });

  it("duplicate notification is processed once", async () => {
    const c = await company();
    const { p } = await order(c.id);
    expect((await note(p)).ok).toBe(true);
    const exp1 = (await getCompany(c.id)).planExpiresAt!.getTime();
    expect(await note(p)).toEqual({ ok: true, duplicated: true });
    expect((await getCompany(c.id)).planExpiresAt!.getTime()).toBe(exp1);
    expect(confirmReferral).toHaveBeenCalledTimes(1);
    expect(await db.select().from(schema.paymentEvents)).toHaveLength(1);
  });

  it("concurrent duplicates activate once", async () => {
    const c = await company();
    const { p } = await order(c.id);
    const rs = await Promise.all([note(p), note(p), note(p)]);
    expect(rs.filter((r) => "duplicated" in r && r.duplicated)).toHaveLength(2);
    expect(await db.select().from(schema.paymentEvents)).toHaveLength(1);
  });

  it("amount mismatch does not activate and is audited", async () => {
    const c = await company();
    const { p } = await order(c.id);
    expect(await note(p, "paid", 100)).toEqual({ ok: false, reason: "amount_mismatch" });
    expect((await getCompany(c.id)).plan).toBe("FREE");
    expect((await db.select().from(schema.payments).where(eq(schema.payments.id, p.id)))[0].status).toBe("PENDING");
    expect(audit).toHaveBeenCalledWith("error.payment_amount_mismatch", expect.anything());
  });

  it("unknown invoice and provider mismatch are rejected", async () => {
    expect(await note({ invoiceNo: 999999, amountMinor: 1 })).toEqual({ ok: false, reason: "unknown_payment" });
    const c = await company();
    const { p } = await order(c.id);
    expect(await processNotification("robokassa", { ok: true, invoiceNo: p.invoiceNo, amountMinor: p.amountMinor, kind: "paid", raw: {} })).toEqual({ ok: false, reason: "provider_mismatch" });
  });

  it("failed notification marks FAILED and never activates; later paid is ignored", async () => {
    const c = await company();
    const { p } = await order(c.id);
    await note(p, "failed");
    expect((await db.select().from(schema.payments).where(eq(schema.payments.id, p.id)))[0].status).toBe("FAILED");
    const r = await note(p, "paid");
    expect(r).toMatchObject({ ok: true, changed: false });
    expect((await getCompany(c.id)).plan).toBe("FREE");
  });

  it("refund rolls expiry back by the paid period, or to FREE when nothing remains", async () => {
    const c = await company();
    const { p: p1 } = await order(c.id, "PRO", 1);
    await note(p1);
    const { p: p2 } = await order(c.id, "PRO", 1);
    await note(p2);
    await note(p2, "refunded");
    let after = await getCompany(c.id);
    expect(after.plan).toBe("PRO");
    expect((after.planExpiresAt!.getTime() - Date.now()) / DAY).toBeLessThan(32);
    expect((await db.select().from(schema.payments).where(eq(schema.payments.id, p2.id)))[0].status).toBe("REFUNDED");
    await note(p1, "refunded");
    after = await getCompany(c.id);
    expect(after.plan).toBe("FREE");
    expect(after.planExpiresAt).toBeNull();
    expect((await db.select().from(schema.subscriptions).where(eq(schema.subscriptions.companyId, c.id)))[0].status).toBe("CANCELED");
  });

  it("refund of an unpaid payment changes nothing", async () => {
    const c = await company();
    const { p } = await order(c.id);
    expect(await note(p, "refunded")).toMatchObject({ ok: true, changed: false });
    expect((await db.select().from(schema.payments).where(eq(schema.payments.id, p.id)))[0].status).toBe("PENDING");
  });

  it("expireSubscriptions downgrades lapsed companies, is idempotent, and spares active ones", async () => {
    const lapsed = await company({ plan: "PRO", planExpiresAt: new Date(Date.now() - DAY) });
    const live = await company({ plan: "TOP", planExpiresAt: new Date(Date.now() + DAY) });
    await db.insert(schema.subscriptions).values([
      { companyId: lapsed.id, plan: "PRO", status: "ACTIVE", provider: "mock", currentPeriodEnd: new Date(Date.now() - DAY) },
      { companyId: live.id, plan: "TOP", status: "ACTIVE", provider: "mock", currentPeriodEnd: new Date(Date.now() + DAY) },
    ]);
    expect(await expireSubscriptions()).toEqual({ companies: 1, subscriptions: 1 });
    expect(await expireSubscriptions()).toEqual({ companies: 0, subscriptions: 0 });
    expect((await getCompany(lapsed.id)).plan).toBe("FREE");
    expect((await getCompany(live.id)).plan).toBe("TOP");
    expect((await db.select().from(schema.subscriptions).where(eq(schema.subscriptions.companyId, lapsed.id)))[0].status).toBe("EXPIRED");
  });

  it("cancelSubscription sets cancelAtPeriodEnd", async () => {
    const c = await company();
    const { p } = await order(c.id);
    await note(p);
    await cancelSubscription(c.id);
    expect((await db.select().from(schema.subscriptions).where(eq(schema.subscriptions.companyId, c.id)))[0].cancelAtPeriodEnd).toBe(true);
  });

  it("diagnostics expose no secrets and report counts", async () => {
    process.env.ROBOKASSA_PASSWORD1 = "SUPERSECRET";
    const c = await company();
    const { p } = await order(c.id);
    await note(p);
    const d = await getPaymentDiagnostics();
    expect(JSON.stringify(d)).not.toContain("SUPERSECRET");
    expect(d.countsByStatus.PAID).toBe(1);
    expect(d.lastEvents).toHaveLength(1);
    expect(d.countries.BY.live).toBe(false);
    delete process.env.ROBOKASSA_PASSWORD1;
  });
});
