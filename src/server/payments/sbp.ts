import "server-only";
import { and, count, desc, eq, isNotNull } from "drizzle-orm";
import { audit } from "@/server/audit";
import { db, schema } from "@/server/db";
import { confirmReferral } from "@/server/loyalty/service";
import { issueReceipt, npdConfigured } from "./npd";
import { addMonths } from "./dates";
import { PaymentError, appUrl, type PaymentProvider } from "./types";

/**
 * Manual SBP transfer to the owner's account (no acquiring contract needed).
 * Flow: business sees phone/bank/amount/code → transfers → presses "Я оплатил" → plan is granted
 * for a short grace period → platform admin confirms (full period, НПД receipt) or rejects (plan restored).
 */
export const GRACE_DAYS = 3;
const RANK = { FREE: 0, PRO: 1, TOP: 2 } as const;

export const sbp: PaymentProvider = {
  id: "sbp",
  isConfigured: () => Boolean(process.env.SBP_PHONE),
  isLive: () => Boolean(process.env.SBP_PHONE),
  createCheckout: (payment) => ({ redirectUrl: appUrl(`/app/billing/sbp/${payment.id}`) }),
  verifyNotification: () => ({ ok: false, invoiceNo: NaN, amountMinor: 0, kind: "paid", raw: {} }),
};

export function sbpDetails() {
  return {
    phone: process.env.SBP_PHONE ?? "",
    bank: process.env.SBP_BANK ?? "",
    recipient: process.env.SBP_RECIPIENT ?? "",
  };
}

export const paymentCode = (invoiceNo: number) => `BG-${invoiceNo}`;

async function loadOwn(companyId: string, paymentId: string) {
  const [p] = await db
    .select()
    .from(schema.payments)
    .where(and(eq(schema.payments.id, paymentId), eq(schema.payments.companyId, companyId), eq(schema.payments.provider, "sbp")))
    .limit(1);
  if (!p) throw new PaymentError("Платёж не найден", "not_found");
  return p;
}

export async function getSbpPayment(companyId: string, paymentId: string) {
  const p = await loadOwn(companyId, paymentId);
  return { payment: p, details: sbpDetails(), code: paymentCode(p.invoiceNo) };
}

const innRe = /^(\d{10}|\d{12})$/;

/** Business says it has transferred the money. Grants a grace period unless abuse signals are present. */
export async function claimSbpPayment(companyId: string, paymentId: string, payer: { inn?: string; name?: string }, now = new Date()) {
  const inn = payer.inn?.trim() || undefined;
  if (inn && !innRe.test(inn)) throw new PaymentError("ИНН плательщика — 10 или 12 цифр", "bad_inn");
  const result = await db.transaction(async (tx) => {
    const [p] = await tx
      .select()
      .from(schema.payments)
      .where(and(eq(schema.payments.id, paymentId), eq(schema.payments.companyId, companyId), eq(schema.payments.provider, "sbp")))
      .for("update");
    if (!p) throw new PaymentError("Платёж не найден", "not_found");
    if (p.status !== "PENDING") return { claimed: false, grace: false, status: p.status };
    if (p.claimedAt) return { claimed: true, grace: p.graceApplied, status: p.status };

    const [company] = await tx.select().from(schema.companies).where(eq(schema.companies.id, companyId)).for("update");
    // No instant grace after a rejected transfer, or while another claim awaits review.
    const [{ n: rejected }] = await tx
      .select({ n: count() })
      .from(schema.payments)
      .where(and(eq(schema.payments.companyId, companyId), eq(schema.payments.provider, "sbp"), eq(schema.payments.failReason, "sbp_rejected")));
    const [{ n: openClaims }] = await tx
      .select({ n: count() })
      .from(schema.payments)
      .where(and(eq(schema.payments.companyId, companyId), eq(schema.payments.status, "PENDING"), isNotNull(schema.payments.claimedAt), eq(schema.payments.graceApplied, true)));
    const graceEnd = new Date(now.getTime() + GRACE_DAYS * 86400_000);
    const currentActive = company.plan !== "FREE" && (!company.planExpiresAt || company.planExpiresAt > now);
    const alreadyCovered = currentActive && RANK[company.plan] >= RANK[p.plan] && (!company.planExpiresAt || company.planExpiresAt >= graceEnd);
    const grace = Number(rejected) === 0 && Number(openClaims) === 0 && !alreadyCovered;

    await tx
      .update(schema.payments)
      .set({ claimedAt: now, graceApplied: grace, prevPlan: company.plan, prevPlanExpiresAt: company.planExpiresAt, payerInn: inn ?? null, payerName: payer.name?.trim().slice(0, 120) || null })
      .where(eq(schema.payments.id, p.id));
    if (grace) await tx.update(schema.companies).set({ plan: p.plan, planExpiresAt: graceEnd }).where(eq(schema.companies.id, companyId));
    return { claimed: true, grace, status: p.status };
  });
  await audit("billing.sbp_claimed", { companyId, meta: { paymentId, grace: result.grace } });
  return result;
}

export async function listSbpClaims(limit = 50) {
  return db
    .select({ payment: schema.payments, companyName: schema.companies.name, companyTaxId: schema.companies.taxId, companyLegalName: schema.companies.legalName })
    .from(schema.payments)
    .innerJoin(schema.companies, eq(schema.companies.id, schema.payments.companyId))
    .where(and(eq(schema.payments.provider, "sbp"), isNotNull(schema.payments.claimedAt)))
    .orderBy(desc(schema.payments.claimedAt))
    .limit(limit);
}

/** Admin confirms the transfer arrived: full period from the pre-claim state, then НПД receipt. */
export async function confirmSbpPayment(paymentId: string, adminUserId: string, now = new Date()) {
  const r = await db.transaction(async (tx) => {
    const [p] = await tx.select().from(schema.payments).where(and(eq(schema.payments.id, paymentId), eq(schema.payments.provider, "sbp"))).for("update");
    if (!p) throw new PaymentError("Платёж не найден", "not_found");
    if (p.status !== "PENDING") return { changed: false, payment: p };
    const [company] = await tx.select().from(schema.companies).where(eq(schema.companies.id, p.companyId)).for("update");
    // Base the period on the plan the company had before the grace grant, so grace days are not double-counted.
    const prevPlan = p.graceApplied ? p.prevPlan : company.plan;
    const prevExp = p.graceApplied ? p.prevPlanExpiresAt : company.planExpiresAt;
    const stack = prevPlan === p.plan && prevExp && prevExp > now;
    const end = addMonths(stack ? prevExp! : now, p.months);
    await tx.update(schema.payments).set({ status: "PAID", paidAt: now }).where(eq(schema.payments.id, p.id));
    await tx.update(schema.companies).set({ plan: p.plan, planExpiresAt: end }).where(eq(schema.companies.id, p.companyId));
    const [sub] = await tx.select().from(schema.subscriptions).where(eq(schema.subscriptions.companyId, p.companyId)).orderBy(desc(schema.subscriptions.createdAt)).limit(1);
    if (sub) await tx.update(schema.subscriptions).set({ plan: p.plan, status: "ACTIVE", provider: "sbp", currentPeriodEnd: end, cancelAtPeriodEnd: false, updatedAt: now }).where(eq(schema.subscriptions.id, sub.id));
    else await tx.insert(schema.subscriptions).values({ companyId: p.companyId, plan: p.plan, status: "ACTIVE", provider: "sbp", currentPeriodEnd: end });
    await tx
      .insert(schema.paymentEvents)
      .values({ provider: "sbp", eventKey: `sbp:${p.invoiceNo}:paid`, paymentId: p.id, kind: "paid", verified: true, payload: { confirmedBy: adminUserId } })
      .onConflictDoNothing({ target: schema.paymentEvents.eventKey });
    return { changed: true, payment: { ...p, status: "PAID" as const, paidAt: now }, company };
  });
  if (!r.changed) return { changed: false, receipt: null };
  await audit("billing.sbp_confirmed", { actorUserId: adminUserId, companyId: r.payment.companyId, meta: { paymentId } });
  try {
    await confirmReferral(r.payment.companyId);
  } catch (e) {
    await audit("error.referral_confirm_failed", { companyId: r.payment.companyId, meta: { message: e instanceof Error ? e.message : String(e) } });
  }
  const receipt = await issueSbpReceipt(paymentId);
  return { changed: true, receipt };
}

/** Issues (or re-tries) the НПД receipt for a PAID SBP payment. Never throws. */
export async function issueSbpReceipt(paymentId: string): Promise<{ ok: boolean; id?: string; error?: string }> {
  const [row] = await db
    .select({ p: schema.payments, c: schema.companies })
    .from(schema.payments)
    .innerJoin(schema.companies, eq(schema.companies.id, schema.payments.companyId))
    .where(eq(schema.payments.id, paymentId))
    .limit(1);
  if (!row || row.p.status !== "PAID") return { ok: false, error: "Платёж не оплачен" };
  if (row.p.npdReceiptId) return { ok: true, id: row.p.npdReceiptId };
  if (!npdConfigured()) {
    await db.update(schema.payments).set({ npdError: "Автоматические чеки не настроены — выбейте чек в «Мой налог» вручную" }).where(eq(schema.payments.id, paymentId));
    return { ok: false, error: "not_configured" };
  }
  const inn = row.p.payerInn ?? (row.c.taxId && innRe.test(row.c.taxId) ? row.c.taxId : null);
  const months = row.p.months;
  try {
    const id = await issueReceipt({
      serviceName: `Подписка BONUSGO ${row.p.plan}, ${months} мес. (${paymentCode(row.p.invoiceNo)})`,
      amountMinor: row.p.amountMinor,
      operationTime: row.p.claimedAt ?? row.p.paidAt ?? new Date(),
      client: inn ? { type: "FROM_LEGAL_ENTITY", inn, displayName: row.p.payerName ?? row.c.legalName ?? row.c.name } : { type: "FROM_INDIVIDUAL" },
    });
    await db.update(schema.payments).set({ npdReceiptId: id, npdError: null }).where(eq(schema.payments.id, paymentId));
    return { ok: true, id };
  } catch (e) {
    const msg = (e instanceof Error ? e.message : String(e)).slice(0, 300);
    await db.update(schema.payments).set({ npdError: msg }).where(eq(schema.payments.id, paymentId));
    await audit("error.npd_receipt_failed", { companyId: row.p.companyId, meta: { paymentId, message: msg } });
    return { ok: false, error: msg };
  }
}

/** Admin: transfer did not arrive. Restores the plan the company had before the grace grant. */
export async function rejectSbpPayment(paymentId: string, adminUserId: string, now = new Date()) {
  const r = await db.transaction(async (tx) => {
    const [p] = await tx.select().from(schema.payments).where(and(eq(schema.payments.id, paymentId), eq(schema.payments.provider, "sbp"))).for("update");
    if (!p) throw new PaymentError("Платёж не найден", "not_found");
    if (p.status !== "PENDING") return { changed: false, companyId: p.companyId };
    await tx.update(schema.payments).set({ status: "FAILED", failReason: "sbp_rejected" }).where(eq(schema.payments.id, p.id));
    if (p.graceApplied && p.claimedAt) {
      const [company] = await tx.select().from(schema.companies).where(eq(schema.companies.id, p.companyId)).for("update");
      const graceEnd = p.claimedAt.getTime() + GRACE_DAYS * 86400_000;
      // Restore only if nothing else (e.g. a real payment) has changed the plan since the grace grant.
      if (company.plan === p.plan && company.planExpiresAt && Math.abs(company.planExpiresAt.getTime() - graceEnd) < 1000) {
        const prevActive = p.prevPlanExpiresAt === null ? p.prevPlan !== "FREE" : p.prevPlanExpiresAt > now;
        await tx
          .update(schema.companies)
          .set(prevActive ? { plan: p.prevPlan ?? "FREE", planExpiresAt: p.prevPlanExpiresAt } : { plan: "FREE", planExpiresAt: null })
          .where(eq(schema.companies.id, p.companyId));
      }
    }
    return { changed: true, companyId: p.companyId };
  });
  if (r.changed) await audit("billing.sbp_rejected", { actorUserId: adminUserId, companyId: r.companyId, meta: { paymentId } });
  return r;
}
