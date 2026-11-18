import { createHmac, timingSafeEqual } from "node:crypto";
import { PaymentError, appUrl, testModeOn, type PaymentProvider } from "./types";

/** Test-only provider. Its "payment page" is a signed link that goes through the same processNotification pipeline. */
export const mockAllowed = () => !(process.env.NODE_ENV === "production" && !testModeOn());

export const mockSig = (invoiceNo: number | string) =>
  createHmac("sha256", process.env.SESSION_SECRET ?? "").update(`mock:${invoiceNo}`).digest("hex");

export const mock: PaymentProvider = {
  id: "mock",
  isConfigured: () => mockAllowed(),
  isLive: () => false,
  createCheckout(payment) {
    if (!mockAllowed()) throw new PaymentError("Тестовый провайдер запрещён в production", "mock_forbidden");
    return { redirectUrl: appUrl(`/api/payments/mock/complete?invoice=${payment.invoiceNo}&sig=${mockSig(payment.invoiceNo)}`) };
  },
  verifyNotification(input) {
    const bad = { ok: false, invoiceNo: NaN, amountMinor: NaN, kind: "paid" as const, raw: {} };
    if (!mockAllowed() || !process.env.SESSION_SECRET) return bad;
    const inv = input.query?.invoice ?? "";
    const sig = input.query?.sig ?? "";
    const exp = Buffer.from(mockSig(inv));
    const got = Buffer.from(sig);
    if (!/^\d+$/.test(inv) || exp.length !== got.length || !timingSafeEqual(exp, got)) return bad;
    if (typeof input.expectedAmountMinor !== "number") return bad;
    return { ok: true, invoiceNo: Number(inv), amountMinor: input.expectedAmountMinor, kind: "paid", raw: { invoice: inv } };
  },
};
