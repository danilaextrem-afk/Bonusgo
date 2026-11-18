import "server-only";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { PaymentError, appUrl, formatMajor, type PaymentProvider, type VerifiedNotification } from "./types";

/**
 * Platega.io (RU, RUB). Docs: platega-io.gitbook.io/platega.io-api-dokumentaciya
 * - Create: POST /transaction/process with X-MerchantId / X-Secret headers → { transactionId, redirect }
 * - Callback: POST to our URL with the SAME X-MerchantId / X-Secret headers and no body signature,
 *   so the callback is only a hint: we always re-read the transaction from the API before acting.
 * Only official methods are allowed: 2 = СБП (QR НСПК), 10 = карты РФ (3DS). P2P methods are never used.
 */
const BASE = (process.env.PLATEGA_API_URL ?? "https://app.platega.io").replace(/\/$/, "");
const ALLOWED_METHODS = new Set([2, 10]);

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
  isLive: plategaConfigured,
  async createCheckout(payment) {
    if (!plategaConfigured()) throw new PaymentError("Platega не настроена", "provider_not_configured");
    const id = randomUUID();
    // Store our transaction id first: the callback is matched by it.
    await db.update(schema.payments).set({ providerRef: id }).where(eq(schema.payments.id, payment.id));
    const res = await fetch(`${BASE}/transaction/process`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        paymentMethod: method(),
        id,
        paymentDetails: { amount: Number(formatMajor(payment.amountMinor)), currency: payment.currency },
        description: `Подписка QRonus ${payment.plan}, ${payment.months} мес. (счёт ${payment.invoiceNo})`,
        return: appUrl("/app/billing?status=success"),
        failedUrl: appUrl("/app/billing?status=fail"),
        payload: String(payment.invoiceNo),
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const text = await res.text();
    if (!res.ok) throw new PaymentError(`Platega: HTTP ${res.status} ${text.slice(0, 150)}`, "provider_error");
    const body = JSON.parse(text) as { redirect?: string; transactionId?: string };
    if (!body.redirect || !/^https:\/\//.test(body.redirect)) throw new PaymentError("Platega не вернула ссылку на оплату", "provider_error");
    if (body.transactionId && body.transactionId !== id) {
      await db.update(schema.payments).set({ providerRef: body.transactionId }).where(eq(schema.payments.id, payment.id));
    }
    return { redirectUrl: body.redirect };
  },
  // Not used directly: callbacks go through verifyPlategaTransaction (server-side re-check).
  verifyNotification: () => ({ ok: false, invoiceNo: NaN, amountMinor: 0, kind: "paid", raw: {} }),
};

type PlategaTx = { id: string; status: string; paymentDetails?: { amount?: number | string; currency?: string } };

/** Re-reads the transaction from Platega and turns it into a verified notification for our pipeline. */
export async function verifyPlategaTransaction(transactionId: string): Promise<VerifiedNotification | null> {
  if (!/^[0-9a-f-]{36}$/i.test(transactionId)) return null;
  const [p] = await db.select().from(schema.payments).where(eq(schema.payments.providerRef, transactionId)).limit(1);
  if (!p || p.provider !== "platega") return null;
  const res = await fetch(`${BASE}/transaction/${encodeURIComponent(transactionId)}`, { headers: headers(), signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Platega status HTTP ${res.status}`);
  const tx = (await res.json()) as PlategaTx;
  if (tx.id && tx.id !== transactionId) return null;
  const amount = Math.round(Number(tx.paymentDetails?.amount ?? NaN) * 100);
  const currency = tx.paymentDetails?.currency === "RUB" || tx.paymentDetails?.currency === "BYN" ? tx.paymentDetails.currency : undefined;
  const raw = { transactionId, status: tx.status, amount: tx.paymentDetails?.amount ?? null, currency: tx.paymentDetails?.currency ?? null };
  if (tx.status === "CONFIRMED") return { ok: true, invoiceNo: p.invoiceNo, amountMinor: amount, currency, kind: "paid", providerRef: transactionId, raw };
  if (tx.status === "CANCELED" || tx.status === "EXPIRED" || tx.status === "FAILED")
    return { ok: true, invoiceNo: p.invoiceNo, amountMinor: p.amountMinor, kind: "failed", failReason: `platega_${tx.status.toLowerCase()}`, providerRef: transactionId, raw };
  return null; // PENDING or unknown: nothing to do yet
}
