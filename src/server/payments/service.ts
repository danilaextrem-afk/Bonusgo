import "server-only";
import { and, count, desc, eq, gt, lt, ne, sql } from "drizzle-orm";
import { COUNTRY, PLAN_PRICES, type CountryCode } from "@/lib/plans";
import { audit } from "@/server/audit";
import { db, schema } from "@/server/db";
import { confirmReferral } from "@/server/loyalty/service";
import { PROVIDERS, providerFor } from "./registry";
import { issueSbpReceipt as issuePaymentReceipt } from "./sbp";
import { PLATEGA_MAX_MINOR } from "./platega";
import { PaymentError, testModeOn, testPaymentsMayActivate, type ProviderId, type VerifiedNotification } from "./types";

export type PaidPlan = "PRO" | "TOP";
export type Months = 1 | 3 | 12;
const MONTH_MULT: Record<Months, number> = { 1: 1, 3: 3, 12: 10 }; // 12 months = 10x (two months free)

export function priceFor(country: CountryCode, plan: PaidPlan, months: Months): number {
  return PLAN_PRICES[country][plan] * MONTH_MULT[months];
}

export { addMonths } from "./dates";
import { addMonths } from "./dates";

export async function createPaymentOrder(companyId: string, plan: PaidPlan, months: Months, payer?: { id: string; email: string }) {
  if (plan !== "PRO" && plan !== "TOP") throw new PaymentError("Неизвестный тариф", "bad_plan");
  if (![1, 3, 12].includes(months)) throw new PaymentError("Недопустимый срок", "bad_months");
  const [company] = await db.select().from(schema.companies).where(eq(schema.companies.id, companyId)).limit(1);
  if (!company || company.deletedAt) throw new PaymentError("Компания не найдена", "no_company");
  const provider = providerFor(company.country);
  const amountMinor = priceFor(company.country, plan, months);
  if (provider.id === "platega" && amountMinor > PLATEGA_MAX_MINOR) {
    throw new PaymentError("Один платёж через Platega не может превышать 10 000 ₽. Выберите меньший срок.", "platega_amount_limit");
  }
  if (provider.id === "platega" && !payer) {
    throw new PaymentError("Нужен контакт плательщика для оплаты", "payer_contact_required");
  }
  // Manual SBP transfers are always real money; other providers are test unless live.
  const test = provider.id === "sbp" ? false : testModeOn() || !provider.isLive();
  if (!provider.isConfigured() || (provider.id !== "mock" && !testModeOn() && !provider.isLive())) {
    throw new PaymentError("Приём платежей для вашей страны пока не подключён", "payments_unavailable");
  }
  const [payment] = await db
    .insert(schema.payments)
    .values({ companyId, provider: provider.id, plan, months, amountMinor, currency: COUNTRY[company.country].currency, status: "PENDING", testMode: test })
    .returning();
  try {
    const { redirectUrl } = await provider.createCheckout(payment, company, payer);
    return { paymentId: payment.id, invoiceNo: payment.invoiceNo, redirectUrl };
  } catch (e) {
    await db.update(schema.payments).set({ status: "FAILED", failReason: e instanceof Error ? e.message.slice(0, 200) : "checkout_error" }).where(eq(schema.payments.id, payment.id));
    throw e;
  }
}

export type NotificationResult =
  | { ok: true; duplicated?: false; status: string; companyId?: string; changed: boolean }
  | { ok: true; duplicated: true }
  | { ok: false; reason: "bad_signature" | "unknown_payment" | "provider_mismatch" | "amount_mismatch" };

export async function processNotification(providerId: ProviderId, parsed: VerifiedNotification): Promise<NotificationResult> {
  if (!parsed.ok) {
    await audit("error.payment_bad_signature", { meta: { provider: providerId, invoiceNo: Number.isFinite(parsed.invoiceNo) ? parsed.invoiceNo : null } }).catch(() => {});
    return { ok: false, reason: "bad_signature" };
  }
  type Out = NotificationResult & { _audit?: [string, Record<string, unknown>]; _companyId?: string };
  const out: Out = await db.transaction(async (tx): Promise<Out> => {
    const locked = await tx.execute(sql`SELECT id FROM payments WHERE invoice_no = ${parsed.invoiceNo} FOR UPDATE`);
    const row = locked.rows[0] as { id: string } | undefined;
    if (!row) return { ok: false, reason: "unknown_payment", _audit: ["error.payment_unknown", { provider: providerId, invoiceNo: parsed.invoiceNo }] };
    const [p] = await tx.select().from(schema.payments).where(eq(schema.payments.id, row.id));
    if (p.provider !== providerId) return { ok: false, reason: "provider_mismatch", _companyId: p.companyId, _audit: ["error.payment_provider_mismatch", { expected: p.provider, got: providerId, invoiceNo: p.invoiceNo }] };

    // Check the amount and currency *before* recording an idempotency event.
    // An invalid notification must not poison the event key and block a valid retry.
    // Failed-payment callbacks intentionally do not require an amount match.
    if (parsed.kind !== "failed" && (parsed.amountMinor !== p.amountMinor || (parsed.currency && parsed.currency !== p.currency))) {
      return { ok: false, reason: "amount_mismatch", _companyId: p.companyId, _audit: ["error.payment_amount_mismatch", { invoiceNo: p.invoiceNo, expected: p.amountMinor, got: parsed.amountMinor, currency: p.currency, gotCurrency: parsed.currency ?? null }] };
    }

    const eventKey = `${providerId}:${parsed.invoiceNo}:${parsed.kind}`;
    const ins = await tx
      .insert(schema.paymentEvents)
      .values({ provider: providerId, eventKey, paymentId: p.id, kind: parsed.kind, verified: true, payload: parsed.raw })
      .onConflictDoNothing({ target: schema.paymentEvents.eventKey })
      .returning({ id: schema.paymentEvents.id });
    if (ins.length === 0) return { ok: true, duplicated: true };

    const now = new Date();
    if (parsed.kind === "failed") {
      if (p.status !== "PENDING") return { ok: true, status: p.status, changed: false };
      await tx.update(schema.payments).set({ status: "FAILED", failReason: (parsed.failReason ?? "provider_failed").slice(0, 200), providerRef: parsed.providerRef ?? p.providerRef }).where(eq(schema.payments.id, p.id));
      return { ok: true, status: "FAILED", changed: true, companyId: p.companyId };
    }

    const [company] = await tx.select().from(schema.companies).where(eq(schema.companies.id, p.companyId)).for("update");
    if (!company) return { ok: false, reason: "unknown_payment", _audit: ["error.payment_no_company", { invoiceNo: p.invoiceNo }] };
    const [sub] = await tx.select().from(schema.subscriptions).where(eq(schema.subscriptions.companyId, p.companyId)).orderBy(desc(schema.subscriptions.createdAt)).limit(1);

    if (parsed.kind === "paid") {
      // Platega can confirm a transaction after CANCELED. Only allow reopening
      // a payment previously failed by Platega's verified cancellation status.
      // Never reopen provider errors, failed checkouts, or other payment methods.
      const latePlategaConfirmation = providerId === "platega" && p.status === "FAILED" &&
        (p.failReason === "platega_canceled" || p.failReason === "platega_expired");
      if (p.status !== "PENDING" && !latePlategaConfirmation) return { ok: true, status: p.status, changed: false, companyId: p.companyId };
      if (p.testMode && !testPaymentsMayActivate()) {
        return { ok: true, status: p.status, changed: false, companyId: p.companyId, _companyId: p.companyId, _audit: ["error.test_payment_in_production", { invoiceNo: p.invoiceNo, provider: providerId }] };
      }
      const stack = company.plan === p.plan && company.planExpiresAt && company.planExpiresAt > now;
      const end = addMonths(stack ? company.planExpiresAt! : now, p.months);
      await tx.update(schema.payments).set({ status: "PAID", paidAt: now, providerRef: parsed.providerRef ?? p.providerRef }).where(eq(schema.payments.id, p.id));
      await tx.update(schema.companies).set({ plan: p.plan, planExpiresAt: end }).where(eq(schema.companies.id, p.companyId));
      if (sub) await tx.update(schema.subscriptions).set({ plan: p.plan, status: "ACTIVE", provider: providerId, currentPeriodEnd: end, cancelAtPeriodEnd: false, updatedAt: now }).where(eq(schema.subscriptions.id, sub.id));
      else await tx.insert(schema.subscriptions).values({ companyId: p.companyId, plan: p.plan, status: "ACTIVE", provider: providerId, currentPeriodEnd: end });
      return { ok: true, status: "PAID", changed: true, companyId: p.companyId, _companyId: p.companyId };
    }

    // refunded
    if (p.status !== "PAID") return { ok: true, status: p.status, changed: false, companyId: p.companyId };
    await tx.update(schema.payments).set({ status: "REFUNDED", refundedAt: now }).where(eq(schema.payments.id, p.id));
    if (company.plan === p.plan && company.planExpiresAt) {
      const rolled = addMonths(company.planExpiresAt, -p.months);
      if (rolled <= now) {
        await tx.update(schema.companies).set({ plan: "FREE", planExpiresAt: null }).where(eq(schema.companies.id, p.companyId));
        if (sub) await tx.update(schema.subscriptions).set({ status: "CANCELED", currentPeriodEnd: now, updatedAt: now }).where(eq(schema.subscriptions.id, sub.id));
      } else {
        await tx.update(schema.companies).set({ planExpiresAt: rolled }).where(eq(schema.companies.id, p.companyId));
        if (sub) await tx.update(schema.subscriptions).set({ currentPeriodEnd: rolled, updatedAt: now }).where(eq(schema.subscriptions.id, sub.id));
      }
    }
    return { ok: true, status: "REFUNDED", changed: true, companyId: p.companyId };
  });

  const { _audit, _companyId, ...result } = out;
  if (_audit) await audit(_audit[0], { companyId: _companyId, meta: _audit[1] }).catch(() => {});
  if (result.ok && !result.duplicated && result.status === "PAID" && result.changed && result.companyId) {
    // Self-employed (НПД) receipt for providers that don't fiscalize themselves. Never throws.
    if (providerId === "platega") {
      const [paid] = await db.select({ id: schema.payments.id }).from(schema.payments).where(eq(schema.payments.invoiceNo, parsed.invoiceNo)).limit(1);
      if (paid) await issuePaymentReceipt(paid.id);
    }
    try {
      await confirmReferral(result.companyId);
    } catch (e) {
      await audit("error.referral_confirm_failed", { companyId: result.companyId, meta: { message: e instanceof Error ? e.message : String(e) } }).catch(() => {});
    }
  }
  return result as NotificationResult;
}

export async function cancelSubscription(companyId: string) {
  const r = await db
    .update(schema.subscriptions)
    .set({ cancelAtPeriodEnd: true, updatedAt: new Date() })
    .where(and(eq(schema.subscriptions.companyId, companyId), eq(schema.subscriptions.status, "ACTIVE")))
    .returning({ id: schema.subscriptions.id });
  await audit("billing.cancel_at_period_end", { companyId, meta: { updated: r.length } }).catch(() => {});
  return { updated: r.length };
}

/** Idempotent: moves lapsed companies to FREE and their subscriptions to EXPIRED. */
export async function expireSubscriptions(now = new Date()) {
  return db.transaction(async (tx) => {
    const cs = await tx
      .update(schema.companies)
      .set({ plan: "FREE", planExpiresAt: null })
      .where(and(ne(schema.companies.plan, "FREE"), lt(schema.companies.planExpiresAt, now)))
      .returning({ id: schema.companies.id });
    const ss = await tx
      .update(schema.subscriptions)
      .set({ status: "EXPIRED", updatedAt: now })
      .where(and(eq(schema.subscriptions.status, "ACTIVE"), lt(schema.subscriptions.currentPeriodEnd, now)))
      .returning({ id: schema.subscriptions.id });
    return { companies: cs.length, subscriptions: ss.length };
  });
}

export async function getPaymentDiagnostics() {
  const since = new Date(Date.now() - 30 * 86400_000);
  const [byStatus, events, failures] = await Promise.all([
    db.select({ status: schema.payments.status, n: count() }).from(schema.payments).groupBy(schema.payments.status),
    db
      .select({ id: schema.paymentEvents.id, provider: schema.paymentEvents.provider, eventKey: schema.paymentEvents.eventKey, kind: schema.paymentEvents.kind, verified: schema.paymentEvents.verified, receivedAt: schema.paymentEvents.receivedAt })
      .from(schema.paymentEvents)
      .orderBy(desc(schema.paymentEvents.receivedAt))
      .limit(20),
    db.select({ n: count() }).from(schema.payments).where(and(eq(schema.payments.status, "FAILED"), gt(schema.payments.createdAt, since))),
  ]);
  const countries = {} as Record<CountryCode, { provider: string; configured: boolean; live: boolean; testMode: boolean }>;
  for (const c of ["RU", "BY"] as CountryCode[]) {
    const p = providerFor(c);
    countries[c] = { provider: p.id, configured: PROVIDERS[p.id].isConfigured(), live: p.isLive(), testMode: testModeOn() };
  }
  return {
    countries,
    countsByStatus: Object.fromEntries(byStatus.map((r) => [r.status, Number(r.n)])),
    lastEvents: events,
    failures30d: Number(failures[0]?.n ?? 0),
  };
}
