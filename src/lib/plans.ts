// Single source of truth for plans, limits and regional prices.
// BYN prices are an independent price list (not an exchange-rate conversion).
// Owner must confirm BYN prices before enabling live payments in Belarus.
export type PlanId = "FREE" | "PRO" | "TOP";
export type CountryCode = "RU" | "BY";
export type CurrencyCode = "RUB" | "BYN";

export interface PlanLimits {
  venues: number;
  activeCustomers: number;
  programs: number;
  staff: number;
  pointsPrograms: boolean;
  customBranding: boolean;
  rewards: boolean;
  history: boolean;
  advancedAnalytics: boolean;
  referrals: boolean;
  export: boolean;
  removeBranding: boolean;
  automation: boolean;
}

export const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  FREE: { venues: 1, activeCustomers: 100, programs: 1, staff: 0, pointsPrograms: false, customBranding: false, rewards: false, history: false, advancedAnalytics: false, referrals: false, export: false, removeBranding: false, automation: false },
  PRO: { venues: 1, activeCustomers: 1000, programs: 3, staff: 3, pointsPrograms: true, customBranding: true, rewards: true, history: true, advancedAnalytics: true, referrals: false, export: false, removeBranding: false, automation: false },
  TOP: { venues: 20, activeCustomers: 10000, programs: 50, staff: 100, pointsPrograms: true, customBranding: true, rewards: true, history: true, advancedAnalytics: true, referrals: true, export: true, removeBranding: true, automation: true },
};

/** Monthly prices in minor units (kopecks / BYN kopecks). */
export const PLAN_PRICES: Record<CountryCode, Record<Exclude<PlanId, "FREE">, number>> = {
  RU: { PRO: 990_00, TOP: 4890_00 },
  BY: { PRO: 35_00, TOP: 169_00 },
};

export const COUNTRY: Record<CountryCode, { currency: CurrencyCode; locale: string; hreflang: string; path: "ru" | "by"; name: string; phoneExample: string; taxIdLabel: string; providers: string[] }> = {
  RU: { currency: "RUB", locale: "ru-RU", hreflang: "ru-RU", path: "ru", name: "Россия", phoneExample: "+7 900 000-00-00", taxIdLabel: "ИНН", providers: ["robokassa"] },
  BY: { currency: "BYN", locale: "ru-BY", hreflang: "ru-BY", path: "by", name: "Беларусь", phoneExample: "+375 29 000-00-00", taxIdLabel: "УНП", providers: ["bepaid", "webpay"] },
};

export function formatMoney(minor: number, currency: CurrencyCode): string {
  const locale = currency === "RUB" ? "ru-RU" : "ru-BY";
  return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: minor % 100 === 0 ? 0 : 2 }).format(minor / 100);
}

export const ACTIVE_CUSTOMER_DAYS = 90; // a card is "active" if it had activity in the last 90 days
