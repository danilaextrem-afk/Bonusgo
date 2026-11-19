import type { CountryCode } from "@/lib/plans";
import { bepaid } from "./bepaid";
import { mock } from "./mock";
import { robokassa } from "./robokassa";
import { sbp } from "./sbp";
import { platega } from "./platega";
import { testModeOn, type PaymentProvider, type ProviderId } from "./types";
import { webpay } from "./webpay";

export const PROVIDERS: Record<ProviderId, PaymentProvider> = { robokassa, bepaid, webpay, mock, sbp, platega };

/**
 * RU -> Robokassa; BY -> bePaid (WEBPAY is a documented stub).
 * Falls back to the mock provider only when PAYMENTS_TEST_MODE=true and the real one is not configured.
 */
export function providerFor(country: CountryCode): PaymentProvider {
  // Platega is the preferred RU acquirer only after explicit live enablement
  // and all legal/contact prerequisites pass the fail-closed readiness checks.
  if (country === "RU" && platega.isLive()) return platega;
  const real = country === "RU" ? robokassa : bepaid;
  if (real.isConfigured()) return real;
  // RU without an acquiring contract: manual SBP transfer to the owner's account (SBP_PHONE).
  if (country === "RU" && sbp.isConfigured()) return sbp;
  if (testModeOn()) return mock;
  return real; // unconfigured: createPaymentOrder will refuse
}
