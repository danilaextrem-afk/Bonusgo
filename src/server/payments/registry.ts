import type { CountryCode } from "@/lib/plans";
import { bepaid } from "./bepaid";
import { mock } from "./mock";
import { robokassa } from "./robokassa";
import { testModeOn, type PaymentProvider, type ProviderId } from "./types";
import { webpay } from "./webpay";

export const PROVIDERS: Record<ProviderId, PaymentProvider> = { robokassa, bepaid, webpay, mock };

/**
 * RU -> Robokassa; BY -> bePaid (WEBPAY is a documented stub).
 * Falls back to the mock provider only when PAYMENTS_TEST_MODE=true and the real one is not configured.
 */
export function providerFor(country: CountryCode): PaymentProvider {
  const real = country === "RU" ? robokassa : bepaid;
  if (real.isConfigured()) return real;
  if (testModeOn()) return mock;
  return real; // unconfigured: createPaymentOrder will refuse
}
