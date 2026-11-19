import "server-only";
import { timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { PaymentError, appUrl, formatMajor, parseMinor, type PaymentProvider, type VerifiedNotification } from "./types";

/**
 * Platega.io, RUB: https://docs.platega.io/ (checked 2026-11-19).
 * Create: POST /transaction/process WITHOUT id; provider generates transactionId.
 * Callback is only a hint; the status is always re-read from Platega before fulfilment.
 * Live activation requires an explicit environment flag and verified merchant setup.
 * Current approved merchant method: 2 = СБП (QR НСПК).
 */
// Credentials must never be sent to a configurable/third-party hostname.
const BASE = "https://app.platega.io";
export const PLATEGA_MAX_MINOR = 10_000_00;
const ALLOWED_METHODS = new Set([2]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const realSupport = () => {
  const email = process.env.CONTACT_EMAIL?.trim() ?? "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !email.endsWith(".example");
};
export const plategaLiveReady = () =>
  plategaConfigured() &&
  process.env.PLATEGA_LIVE_ENABLED === "true" &&
  process.env.PAYMENTS_TEST_MODE !== "true" &&
  process.env.DEMO_MODE === "false" &&
  realSupport() &&
  Boolean(process.env.OWNER_NAME?.trim() && process.env.OWNER_TAX_ID?.trim() && process.env.OWNER_ADDRESS?.trim());

export const plategaConfigured = () => Boolean(process.env.PLATEGA_MERCHANT_ID && process.env.PLATEGA_SECRET);

function method(): number {
  const m = Number(process.env.PLATEGA_METHOD ?? 2);
  return ALLOWED_METHODS.has(m) ? m : 2;
}

function headers() {
  return { "content-type": "application/json", accept: "application/json", "X-MerchantId": process.env.PLATEGA_MERCHANT_ID ?? "", "X-Secret": process.env.PLATEGA_SECRET ?? "" };
}

const eqSafe = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
};

/** Callback headers must echo our own credentials (Platega's only callback authentication). */
export function plategaCallbackAuthorized(h: Headers): boolean {
  if (!plategaConfigured()) return false;
  return eqSafe(h.get("x-merchantid") ?? "", process.env.PLATEGA_MERCHANT_ID!) && eqSafe(h.get("x-secret") ?? "", process.env.PLATEGA_SECRET!);
}

export const platega: PaymentProvider = {
  id: "platega",
  isConfigured: plategaConfigured,
  isLive: plategaLiveReady,
  async createCheckout(payment, _company, payer) {
    if (!plategaLiveReady()) throw new PaymentError("Platega пока не готова к приёму реальных платежей", "provider_not_ready");
    if (payment.currency !== "RUB" || !Number.isSafeInteger(payment.amountMinor) || payment.amountMinor <= 0 || payment.amountMinor > PLATEGA_MAX_MINOR)
      throw new PaymentError("Максимальная сумма одного платежа Platega — 10 000 ₽", "platega_amount_limit");
    if (!payer || !UUID.test(payer.id) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payer.email))
      throw new PaymentError("Нужен email владельца для оформления платежа", "payer_contact_required");
    const res = await fetch(`${BASE}/transaction/process`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        paymentMethod: method(),
        paymentDetails: { amount: Number(formatMajor(payment.amountMinor)), currency: payment.currency },
        description: `Подписка QRonus ${payment.plan}, ${payment.months} мес. (счёт ${payment.invoiceNo})`,
        return: appUrl("/app/billing?status=success"),
        failedUrl: appUrl("/app/billing?status=fail"),
        payload: String(payment.invoiceNo),
        metadata: { userId: payer.id, user_email: payer.email },
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const text = await res.text();
    if (!res.ok) throw new PaymentError(`Platega: HTTP ${res.status}`, "provider_error");
    // Provider response bodies can contain sensitive details; never echo them into application errors.
    let body: { redirect?: string; transactionId?: string };
    try { body = JSON.parse(text) as typeof body; }
    catch { throw new PaymentError("Platega вернула некорректный ответ", "provider_error"); }
    if (!body || typeof body !== "object")
      throw new PaymentError("Platega вернула некорректный ответ", "provider_error");
    if (!body.transactionId || !UUID.test(body.transactionId))
      throw new PaymentError("Platega не вернула идентификатор транзакции", "provider_error");
    let redirect: URL;
    try { redirect = new URL(body.redirect ?? ""); } catch { throw new PaymentError("Platega не вернула ссылку на оплату", "provider_error"); }
    if (redirect.protocol !== "https:" || redirect.hostname !== "pay.platega.io" || redirect.username || redirect.password)
      throw new PaymentError("Platega вернула недопустимый адрес оплаты", "provider_error");
    await db.update(schema.payments).set({ providerRef: body.transactionId }).where(eq(schema.payments.id, payment.id));
    return { redirectUrl: redirect.href };
  },
  // Not used directly: callbacks go through verifyPlategaTransaction (server-side re-check).
  verifyNotification: () => ({ ok: false, invoiceNo: NaN, amountMinor: 0, kind: "paid", raw: {} }),
};

type PlategaTx = { id: string; status: string; paymentDetails?: { amount?: number | string; currency?: string } };

/** Re-reads the transaction from Platega and turns it into a verified notification for our pipeline. */
export async function verifyPlategaTransaction(transactionId: string): Promise<VerifiedNotification | null> {
  if (!UUID.test(transactionId) || !plategaConfigured()) return null;
  const [p] = await db.select().from(schema.payments).where(eq(schema.payments.providerRef, transactionId)).limit(1);
  if (!p || p.provider !== "platega") return null;
  const res = await fetch(`${BASE}/transaction/${encodeURIComponent(transactionId)}`, { headers: headers(), signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Platega status HTTP ${res.status}`);
  const tx = (await res.json()) as PlategaTx;
  if (tx.id !== transactionId) return null;
  // Exact minor-unit parsing: never round an unexpected fractional amount
  // into a valid invoice total.
  const amount = parseMinor(String(tx.paymentDetails?.amount ?? ""));
  const currency = tx.paymentDetails?.currency === "RUB" ? "RUB" : undefined;
  const raw = { transactionId, status: tx.status, amount: tx.paymentDetails?.amount ?? null, currency: tx.paymentDetails?.currency ?? null };
  // Never activate when Platega omits the currency or reports another currency.
  if ((tx.status === "CONFIRMED" || tx.status === "CHARGEBACKED") && (!Number.isSafeInteger(amount) || currency !== "RUB")) return null;
  if (tx.status === "CONFIRMED") return { ok: true, invoiceNo: p.invoiceNo, amountMinor: amount, currency, kind: "paid", providerRef: transactionId, raw };
  // A full chargeback is a reversal of an already confirmed transaction.
  // Read it from the current provider status, not from the untrusted callback body.
  if (tx.status === "CHARGEBACKED" && currency === "RUB")
    return { ok: true, invoiceNo: p.invoiceNo, amountMinor: amount, currency, kind: "refunded", providerRef: transactionId, raw };
  // A partial refund / dispute needs a separate accounting policy. Never treat
  // either as a fresh payment or a full refund.
  if (tx.status === "PARTIALLY_REFUNDED" || tx.status === "DISPUTED") return null;
  if (tx.status === "CANCELED" || tx.status === "EXPIRED" || tx.status === "FAILED")
    return { ok: true, invoiceNo: p.invoiceNo, amountMinor: p.amountMinor, kind: "failed", failReason: `platega_${tx.status.toLowerCase()}`, providerRef: transactionId, raw };
  return null; // PENDING or unknown: nothing to do yet
}
