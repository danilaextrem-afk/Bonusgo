import "server-only";
import { timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { PaymentError, appUrl, formatMajor, parseMinor, type PaymentProvider, type VerifiedNotification } from "./types";
import { parsePlategaCheckoutResponse, parsePlategaCheckoutUrl } from "./platega-response";

/**
 * Platega.io, RUB: https://docs.platega.io/ (checked 2026-11-19).
 * Create: POST /transaction/process WITHOUT id; provider generates transactionId.
 * Callback is only a hint; the status is always re-read from Platega before fulfilment.
 * Live activation requires an explicit environment flag and verified merchant setup.
 * Implemented merchant method: 2 = СБП (QR НСПК).
 */
// Credentials must never be sent to a configurable/third-party hostname.
const BASE = "https://app.platega.io";
export const PLATEGA_MAX_MINOR = 10_000_00;
const SBP_METHOD = 2;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAYER_ID = /^[A-Za-z0-9_-]{22}$/; // Matches createId() in src/server/id.ts.
function publicHttpsOrigin(value: string | undefined) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password &&
      url.pathname === "/" && !url.search && !url.hash;
  } catch {
    return false;
  }
}

const realSupport = () => {
  const email = process.env.CONTACT_EMAIL?.trim() ?? "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !email.endsWith(".example");
};
export const plategaLiveReady = () =>
  plategaConfigured() &&
  publicHttpsOrigin(process.env.APP_URL) &&
  (process.env.PLATEGA_METHOD ?? "2") === "2" &&
  process.env.PLATEGA_SELLER_PAYS_FEE === "true" &&
  process.env.PLATEGA_LIVE_ENABLED === "true" &&
  process.env.PAYMENTS_TEST_MODE !== "true" &&
  process.env.DEMO_MODE === "false" &&
  realSupport() &&
  Boolean(process.env.OWNER_NAME?.trim() && process.env.OWNER_TAX_ID?.trim() && process.env.OWNER_ADDRESS?.trim());

export const plategaConfigured = () => UUID.test(process.env.PLATEGA_MERCHANT_ID ?? "") && Boolean(process.env.PLATEGA_SECRET?.trim());

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
    if (!payer || !PAYER_ID.test(payer.id) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payer.email))
      throw new PaymentError("Нужен email владельца для оформления платежа", "payer_contact_required");
    const res = await fetch(`${BASE}/transaction/process`, {
      method: "POST",
      headers: headers(),
      redirect: "error",
      body: JSON.stringify({
        paymentMethod: SBP_METHOD,
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
    const body = parsePlategaCheckoutResponse(text);
    if (!body) throw new PaymentError("Platega вернула некорректный ответ", "provider_error");
    if (!body.transactionId || !UUID.test(body.transactionId))
      throw new PaymentError("Platega не вернула идентификатор транзакции", "provider_error");
    const redirect = parsePlategaCheckoutUrl(body.redirect);
    if (!redirect) throw new PaymentError("Platega вернула недопустимый адрес оплаты", "provider_error");
    await db.update(schema.payments).set({ providerRef: body.transactionId, checkoutUrl: redirect }).where(eq(schema.payments.id, payment.id));
    return { redirectUrl: redirect };
  },
  // Not used directly: callbacks go through verifyPlategaTransaction (server-side re-check).
  verifyNotification: () => ({ ok: false, invoiceNo: NaN, amountMinor: 0, kind: "paid", raw: {} }),
};

type PlategaTx = {
  id: string;
  status: string;
  paymentDetails?: { amount?: number | string; currency?: string };
  payload?: unknown;
  mechantId?: unknown; // Spelling in the provider's status response.
  comission?: unknown;
  comissionType?: unknown;
};

/** Re-reads the transaction from Platega and turns it into a verified notification for our pipeline. */
export async function verifyPlategaTransaction(transactionId: string): Promise<VerifiedNotification | null> {
  if (!UUID.test(transactionId) || !plategaConfigured()) return null;
  const [p] = await db.select().from(schema.payments).where(and(eq(schema.payments.providerRef, transactionId), eq(schema.payments.provider, "platega"))).limit(1);
  if (!p) return null;
  const res = await fetch(`${BASE}/transaction/${encodeURIComponent(transactionId)}`, { headers: headers(), redirect: "error", cache: "no-store", signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Platega status HTTP ${res.status}`);
  const tx = (await res.json()) as PlategaTx;
  if (!tx || tx.id !== transactionId ||
      (tx.payload != null && tx.payload !== String(p.invoiceNo)) ||
      (tx.mechantId != null && tx.mechantId !== process.env.PLATEGA_MERCHANT_ID)) return null;
  // Exact minor-unit parsing: never round an unexpected fractional amount
  // into a valid invoice total.
  const amount = parseMinor(String(tx.paymentDetails?.amount ?? ""));
  if (p.currency !== "RUB" || tx.paymentDetails?.currency !== "RUB" ||
      !Number.isSafeInteger(amount) || amount <= 0 || amount > PLATEGA_MAX_MINOR || amount !== p.amountMinor) return null;
  const raw = {
    transactionId, status: tx.status, amountMinor: amount, currency: "RUB",
    commissionReported: typeof tx.comission === "number" && Number.isFinite(tx.comission) ? tx.comission : null,
    commissionTypeReported: Number.isSafeInteger(tx.comissionType) ? tx.comissionType : null,
  };
  const verified = { ok: true, invoiceNo: p.invoiceNo, amountMinor: amount, currency: "RUB" as const, providerRef: transactionId, raw };
  if (tx.status === "CONFIRMED") return { ...verified, kind: "paid" };
  if (tx.status === "CHARGEBACKED") return { ...verified, kind: "refunded" };
  if (tx.status === "CANCELED") return { ...verified, kind: "failed", failReason: "platega_canceled" };
  return null; // PENDING or unknown: nothing to do yet
}
