import { db, schema } from "@/server/db";

const TYPES = new Set(["page_view", "signup_business", "first_card", "venue_activated", "paid", "referral_click"]);
const SOURCES = new Set(["organic", "referral", "direct", "qr", "ads", "social"]);

/** Anonymous funnel event (no PII: path is stripped of query/hash). Never throws. */
export async function trackEvent(type: string, o: { country?: "RU" | "BY"; path?: string; source?: string; companyId?: string } = {}): Promise<void> {
  try {
    if (!TYPES.has(type)) return;
    const path = o.path ? o.path.split(/[?#]/)[0].slice(0, 200) : null;
    const source = o.source && SOURCES.has(o.source) ? o.source : o.source ? "direct" : null;
    const country = o.country === "RU" || o.country === "BY" ? o.country : null;
    await db.insert(schema.analyticsEvents).values({ type, country, path, source, companyId: o.companyId ?? null });
  } catch (e) {
    console.error("[analytics] failed", type, e instanceof Error ? e.message : e);
  }
}
