import { timingSafeEqual } from "node:crypto";
import { PaymentError, appUrl, type PaymentProvider, type VerifiedNotification } from "./types";

// bePaid Checkout API: https://docs.bepaid.by/ — POST https://checkout.bepaid.by/ctp/api/checkouts
// Amounts are in minor units (integer). Webhook is authenticated with the same Basic shop_id:secret_key header.
export const BEPAID_CHECKOUT_URL = "https://checkout.bepaid.by/ctp/api/checkouts";

const shop = () => ({ id: process.env.BEPAID_SHOP_ID ?? "", key: process.env.BEPAID_SECRET_KEY ?? "" });
export const basicHeader = () => "Basic " + Buffer.from(`${shop().id}:${shop().key}`).toString("base64");

function safeEq(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export const bepaid: PaymentProvider = {
  id: "bepaid",
  isConfigured: () => !!(shop().id && shop().key),
  isLive() {
    return process.env.BEPAID_LIVE_ENABLED === "true" && this.isConfigured();
  },
  async createCheckout(payment, company) {
    if (!this.isConfigured()) throw new PaymentError("bePaid не настроен", "not_configured");
    void company;
    const body = {
      checkout: {
        test: !this.isLive() || payment.testMode,
        transaction_type: "payment",
        order: { amount: payment.amountMinor, currency: "BYN", description: `QRonus: тариф ${payment.plan}, ${payment.months} мес.`, tracking_id: String(payment.invoiceNo) },
        settings: {
          notification_url: appUrl("/api/payments/bepaid/webhook"),
          success_url: appUrl("/app/billing?status=success"),
          fail_url: appUrl("/app/billing?status=fail"),
          decline_url: appUrl("/app/billing?status=fail"),
          language: "ru",
        },
      },
    };
    const res = await fetch(BEPAID_CHECKOUT_URL, {
      method: "POST",
      headers: { Authorization: basicHeader(), "Content-Type": "application/json", Accept: "application/json", "X-API-Version": "2" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    const json = (await res.json().catch(() => ({}))) as { checkout?: { redirect_url?: string; token?: string } };
    const url = json.checkout?.redirect_url;
    if (!res.ok || !url) throw new PaymentError(`bePaid: не удалось создать платёж (HTTP ${res.status})`, "provider_error");
    return { redirectUrl: url };
  },
  verifyNotification(input) {
    const bad: VerifiedNotification = { ok: false, invoiceNo: NaN, amountMinor: NaN, kind: "paid", raw: {} };
    const auth = input.headers?.authorization ?? input.headers?.Authorization ?? "";
    if (!this.isConfigured() || !safeEq(auth, basicHeader())) return bad;
    const t = (input.json as { transaction?: Record<string, unknown> } | undefined)?.transaction;
    if (!t) return bad;
    const invoiceNo = Number(t.tracking_id);
    const amountMinor = Number(t.amount);
    if (!Number.isInteger(invoiceNo) || !Number.isInteger(amountMinor)) return bad;
    const status = String(t.status);
    const type = String(t.type);
    let kind: VerifiedNotification["kind"];
    if (type === "refund" || type === "void") kind = status === "successful" ? "refunded" : "failed";
    else kind = status === "successful" ? "paid" : "failed";
    if (kind === "failed" && type !== "payment") return { ...bad, raw: { type, status } };
    const currency = t.currency === "BYN" ? "BYN" : undefined;
    return { ok: true, invoiceNo, amountMinor, currency, kind, providerRef: typeof t.uid === "string" ? t.uid : undefined, failReason: kind === "failed" ? String(t.message ?? status) : undefined, raw: { uid: t.uid, status, type, amount: t.amount, currency: t.currency, tracking_id: t.tracking_id } };
  },
};
