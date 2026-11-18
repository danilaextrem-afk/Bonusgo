import { PaymentError, type PaymentProvider } from "./types";

/**
 * WEBPAY (Belarus) — STUB, not connected. Needs a contract with the provider.
 * Documented scheme (WebPay "wsb_" form): the merchant posts an HTML form to the wsb gateway with fields
 * wsb_storeid, wsb_order_num, wsb_test, wsb_currency_id, wsb_total, wsb_seed, wsb_signature, wsb_notify_url ...
 * wsb_signature = SHA1(wsb_seed + wsb_storeid + wsb_order_num + wsb_test + wsb_currency_id + wsb_total + SecretKey).
 * The notification signature is checked similarly (see provider docs). Exact fields: уточнить у провайдера.
 */
export const webpay: PaymentProvider = {
  id: "webpay",
  isConfigured: () => false,
  isLive: () => false,
  createCheckout() {
    throw new PaymentError("WEBPAY не подключён", "not_configured");
  },
  verifyNotification() {
    return { ok: false, invoiceNo: NaN, amountMinor: NaN, kind: "paid", raw: {} };
  },
};
