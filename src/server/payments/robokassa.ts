import { createHash, timingSafeEqual } from "node:crypto";
import { PaymentError, appUrl, formatMajor, parseMinor, testModeOn, type PaymentProvider } from "./types";

// Protocol: https://docs.robokassa.ru/ (pay-interface). Formulas (verified against an independent
// library description; the official docs site was not reachable from the build sandbox):
//   init:   MD5(MerchantLogin:OutSum:InvId[:Receipt]:Password1[:Shp_k=v ...sorted by key])
//   result: MD5(OutSum:InvId:Password2[:Shp_k=v ...sorted by key]), reply "OK{InvId}"
export const ROBOKASSA_URL = "https://auth.robokassa.ru/Merchant/Index.aspx";

const md5 = (s: string) => createHash("md5").update(s, "utf8").digest("hex");

export function shpPart(shp: Record<string, string>): string[] {
  return Object.keys(shp).sort().map((k) => `${k}=${shp[k]}`);
}

export function initSignature(o: { login: string; outSum: string; invId: number | string; receipt?: string; password1: string; shp?: Record<string, string> }): string {
  const parts = [o.login, o.outSum, String(o.invId)];
  if (o.receipt) parts.push(o.receipt);
  parts.push(o.password1, ...shpPart(o.shp ?? {}));
  return md5(parts.join(":"));
}

export function resultSignature(o: { outSum: string; invId: number | string; password2: string; shp?: Record<string, string> }): string {
  return md5([o.outSum, String(o.invId), o.password2, ...shpPart(o.shp ?? {})].join(":"));
}

function safeEqHex(a: string, b: string): boolean {
  const x = Buffer.from(a.toLowerCase(), "utf8");
  const y = Buffer.from(b.toLowerCase(), "utf8");
  return x.length === y.length && timingSafeEqual(x, y);
}

const creds = (test: boolean) => ({
  login: process.env.ROBOKASSA_LOGIN ?? "",
  p1: (test ? process.env.ROBOKASSA_TEST_PASSWORD1 : process.env.ROBOKASSA_PASSWORD1) ?? "",
  p2: (test ? process.env.ROBOKASSA_TEST_PASSWORD2 : process.env.ROBOKASSA_PASSWORD2) ?? "",
});

export const robokassa: PaymentProvider = {
  id: "robokassa",
  isConfigured() {
    const c = creds(testModeOn());
    return !!(c.login && c.p1 && c.p2);
  },
  isLive() {
    if (testModeOn()) return false;
    return this.isConfigured();
  },
  createCheckout(payment, company) {
    const test = payment.testMode;
    const c = creds(test);
    if (!c.login || !c.p1) throw new PaymentError("Robokassa не настроена", "not_configured");
    const outSum = formatMajor(payment.amountMinor);
    const description = `BONUSGO: тариф ${payment.plan}, ${payment.months} мес.`;
    const shp = { Shp_company: company.id, Shp_plan: payment.plan };
    let receiptRaw: string | undefined;
    if (process.env.ROBOKASSA_SEND_RECEIPT === "true") {
      // For самозанятый ("Робочеки СМЗ") the НПД receipt is formed by Robokassa after enabling it in the
      // cabinet; Receipt is only sent when the owner explicitly switches this on.
      receiptRaw = JSON.stringify({ items: [{ name: description.slice(0, 128), quantity: 1, sum: Number(outSum), payment_method: "full_payment", payment_object: "service", tax: "none" }] });
    }
    // Receipt enters the signature URL-encoded once; URLSearchParams below encodes it again for transport (as the docs require).
    const receiptEnc = receiptRaw ? encodeURIComponent(receiptRaw) : undefined;
    const sig = initSignature({ login: c.login, outSum, invId: payment.invoiceNo, receipt: receiptEnc, password1: c.p1, shp });
    const q = new URLSearchParams({ MerchantLogin: c.login, OutSum: outSum, InvId: String(payment.invoiceNo), Description: description });
    if (receiptEnc) q.set("Receipt", receiptEnc);
    for (const k of Object.keys(shp).sort()) q.set(k, shp[k as keyof typeof shp]);
    q.set("SignatureValue", sig);
    q.set("Culture", "ru");
    if (test) q.set("IsTest", "1");
    return { redirectUrl: `${ROBOKASSA_URL}?${q.toString()}` };
  },
  verifyNotification(input) {
    const f = input.form ?? {};
    const bad = { ok: false, invoiceNo: NaN, amountMinor: NaN, kind: "paid" as const, raw: {} };
    const outSum = f.OutSum ?? f.out_summ ?? "";
    const invId = f.InvId ?? f.inv_id ?? "";
    const given = f.SignatureValue ?? f.crc ?? "";
    if (!outSum || !/^\d+$/.test(invId) || !given) return bad;
    const c = creds(testModeOn());
    if (!c.p2) return bad;
    const shp: Record<string, string> = {};
    for (const [k, v] of Object.entries(f)) if (/^shp_/i.test(k)) shp[k] = v;
    const expected = resultSignature({ outSum, invId, password2: c.p2, shp });
    const amountMinor = parseMinor(outSum);
    const raw = { OutSum: outSum, InvId: invId, ...shp };
    if (!safeEqHex(expected, given) || Number.isNaN(amountMinor)) return { ...bad, invoiceNo: Number(invId), raw };
    return { ok: true, invoiceNo: Number(invId), amountMinor, kind: "paid", raw };
  },
};

export const robokassaSuccessUrl = () => appUrl("/api/payments/robokassa/success");
