import type { CountryCode } from "@/lib/plans";
import { bepaid } from "./bepaid";
import { mock } from "./mock";
import { robokassa } from "./robokassa";
import { sbp } from "./sbp";
import { testModeOn, type PaymentProvider, type ProviderId } from "./types";
import { webpay } from "./webpay";

export const PROVIDERS: Record<ProviderId, PaymentProvider> = { robokassa, bepaid, webpay, mock, sbp };

/**
 * RU -> Robokassa; BY -> bePaid (WEBPAY is a documented stub).
 * Falls back to the mock provider only when PAYMENTS_TEST_MODE=true and the real one is not configured.
 */
export function providerFor(country: CountryCode): PaymentProvider {
  const real = country === "RU" ? robokassa : bepaid;
  if (real.isConfigured()) return real;
  // RU without an acquiring contract: manual SBP transfer to the owner's account (SBP_PHONE).
  if (country === "RU" && sbp.isConfigured()) return sbp;
  if (testModeOn()) return mock;
  return real; // unconfigured: createPaymentOrder will refuse
}
