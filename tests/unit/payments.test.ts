import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/audit", () => ({ audit: vi.fn(async () => {}) }));
vi.mock("@/server/loyalty/service", () => ({ confirmReferral: vi.fn(async () => {}) }));

import { bepaid } from "@/server/payments/bepaid";
import { mock } from "@/server/payments/mock";
import { providerFor } from "@/server/payments/registry";
import { initSignature, resultSignature, robokassa } from "@/server/payments/robokassa";
import { addMonths, priceFor } from "@/server/payments/service";
import { parseMinor, type PaymentRow } from "@/server/payments/types";

const md5 = (s: string) => createHash("md5").update(s).digest("hex");
const env = { ...process.env };
beforeEach(() => {
  process.env.ROBOKASSA_LOGIN = "shop";
  process.env.ROBOKASSA_PASSWORD1 = "pw1";
  process.env.ROBOKASSA_PASSWORD2 = "pw2";
  process.env.ROBOKASSA_TEST_PASSWORD1 = "tp1";
  process.env.ROBOKASSA_TEST_PASSWORD2 = "tp2";
});
afterEach(() => {
  process.env = { ...env };
});

describe("robokassa signatures", () => {
  it("init signature matches independently computed md5 (with Shp sorted)", () => {
    const sig = initSignature({ login: "shop", outSum: "990.00", invId: 7, password1: "pw1", shp: { Shp_plan: "PRO", Shp_company: "c1" } });
    expect(sig).toBe(md5("shop:990.00:7:pw1:Shp_company=c1:Shp_plan=PRO"));
    expect(initSignature({ login: "shop", outSum: "1.00", invId: 1, receipt: "R", password1: "p" })).toBe(md5("shop:1.00:1:R:p"));
  });

  const form = (over: Record<string, string> = {}) => {
    const base = { OutSum: "990.00", InvId: "7", Shp_company: "c1", Shp_plan: "PRO" };
    const f: Record<string, string> = { ...base, ...over };
    f.SignatureValue ??= md5("990.00:7:tp2:Shp_company=c1:Shp_plan=PRO"); // test mode -> test Password2
    return f;
  };

  it("accepts a valid result (case-insensitive signature)", () => {
    expect(robokassa.verifyNotification({ form: form() })).toMatchObject({ ok: true, invoiceNo: 7, amountMinor: 99000, kind: "paid" });
    expect(robokassa.verifyNotification({ form: form({ SignatureValue: md5("990.00:7:tp2:Shp_company=c1:Shp_plan=PRO").toUpperCase() }) }).ok).toBe(true);
    expect(resultSignature({ outSum: "990.00", invId: 7, password2: "tp2", shp: { Shp_plan: "PRO", Shp_company: "c1" } })).toBe(md5("990.00:7:tp2:Shp_company=c1:Shp_plan=PRO"));
  });
  it("rejects tampered sum, tampered Shp, wrong password, missing signature", () => {
    const good = md5("990.00:7:tp2:Shp_company=c1:Shp_plan=PRO");
    expect(robokassa.verifyNotification({ form: form({ OutSum: "1.00", SignatureValue: good }) }).ok).toBe(false);
    expect(robokassa.verifyNotification({ form: form({ Shp_plan: "TOP", SignatureValue: good }) }).ok).toBe(false);
    expect(robokassa.verifyNotification({ form: form({ SignatureValue: md5("990.00:7:wrong:Shp_company=c1:Shp_plan=PRO") }) }).ok).toBe(false);
    expect(robokassa.verifyNotification({ form: { OutSum: "990.00", InvId: "7" } }).ok).toBe(false);
  });
  it("uses live Password2 when test mode is off", () => {
    process.env.PAYMENTS_TEST_MODE = "false";
    const f = { OutSum: "5.00", InvId: "2", SignatureValue: md5("5.00:2:pw2") };
    expect(robokassa.verifyNotification({ form: f }).ok).toBe(true);
    expect(robokassa.isLive()).toBe(true);
  });
  it("checkout URL carries IsTest, Shp and a valid signature", () => {
    const p = { invoiceNo: 7, amountMinor: 99000, plan: "PRO", months: 1, testMode: true } as PaymentRow;
    const url = new URL((robokassa.createCheckout(p, { id: "c1" } as never) as { redirectUrl: string }).redirectUrl);
    expect(url.origin + url.pathname).toBe("https://auth.robokassa.ru/Merchant/Index.aspx");
    expect(url.searchParams.get("OutSum")).toBe("990.00");
    expect(url.searchParams.get("IsTest")).toBe("1");
    expect(url.searchParams.get("Culture")).toBe("ru");
    expect(url.searchParams.get("SignatureValue")).toBe(md5("shop:990.00:7:tp1:Shp_company=c1:Shp_plan=PRO"));
  });
});

describe("providers", () => {
  it("BY live is disabled when unconfigured, and when the live flag is off", () => {
    delete process.env.BEPAID_SHOP_ID;
    delete process.env.BEPAID_SECRET_KEY;
    process.env.BEPAID_LIVE_ENABLED = "true";
    expect(bepaid.isConfigured()).toBe(false);
    expect(bepaid.isLive()).toBe(false);
    process.env.BEPAID_SHOP_ID = "1";
    process.env.BEPAID_SECRET_KEY = "k";
    expect(bepaid.isLive()).toBe(true);
    process.env.BEPAID_LIVE_ENABLED = "false";
    expect(bepaid.isLive()).toBe(false);
  });
  it("bePaid webhook requires the Basic header", () => {
    process.env.BEPAID_SHOP_ID = "1";
    process.env.BEPAID_SECRET_KEY = "k";
    const json = { transaction: { status: "successful", type: "payment", amount: 3500, currency: "BYN", tracking_id: "5", uid: "u" } };
    const auth = "Basic " + Buffer.from("1:k").toString("base64");
    expect(bepaid.verifyNotification({ headers: { authorization: auth }, json })).toMatchObject({ ok: true, invoiceNo: 5, amountMinor: 3500, kind: "paid" });
    expect(bepaid.verifyNotification({ headers: { authorization: "Basic xxx" }, json }).ok).toBe(false);
    expect(bepaid.verifyNotification({ json }).ok).toBe(false);
  });
  it("mock is refused in production without test mode", () => {
    process.env.SESSION_SECRET = "s".repeat(32);
    process.env.PAYMENTS_TEST_MODE = "false";
    vi.stubEnv("NODE_ENV", "production");
    expect(() => mock.createCheckout({ invoiceNo: 1 } as PaymentRow, {} as never)).toThrow();
    expect(mock.verifyNotification({ query: { invoice: "1", sig: "x" }, expectedAmountMinor: 1 }).ok).toBe(false);
    vi.unstubAllEnvs();
  });
  it("registry falls back to mock only in test mode", () => {
    delete process.env.ROBOKASSA_LOGIN;
    process.env.PAYMENTS_TEST_MODE = "true";
    expect(providerFor("RU").id).toBe("mock");
    process.env.PAYMENTS_TEST_MODE = "false";
    expect(providerFor("RU").id).toBe("robokassa");
  });
});

describe("helpers", () => {
  it("prices: 3 months = 3x, 12 months = 10x", () => {
    expect(priceFor("RU", "PRO", 3)).toBe(990_00 * 3);
    expect(priceFor("BY", "TOP", 12)).toBe(169_00 * 10);
  });
  it("parseMinor is exact", () => {
    expect(parseMinor("990.00")).toBe(99000);
    expect(parseMinor("0.5")).toBe(50);
    expect(parseMinor("12")).toBe(1200);
    expect(parseMinor("1e3")).toBeNaN();
  });
  it("addMonths clamps month ends", () => {
    expect(addMonths(new Date("2026-01-31T00:00:00Z"), 1).toISOString()).toBe("2026-02-28T00:00:00.000Z");
  });
});
