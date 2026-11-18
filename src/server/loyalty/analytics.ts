import { createId } from "@/server/id";
import { ydb } from "@/server/ydb/client";
import { nowSec, optText } from "@/server/ydb/values";

const TYPES = new Set(["page_view", "signup_business", "first_card", "venue_activated", "paid", "referral_click"]);
const SOURCES = new Set(["organic", "referral", "direct", "qr", "ads", "social"]);

/** Anonymous funnel event (no PII: path is stripped of query/hash). Never throws. */
export async function trackEvent(type: string, o: { country?: "RU" | "BY"; path?: string; source?: string; companyId?: string } = {}): Promise<void> {
  try {
    if (!TYPES.has(type)) return;
    const path = o.path ? o.path.split(/[?#]/)[0].slice(0, 200) : null;
    const source = o.source && SOURCES.has(o.source) ? o.source : o.source ? "direct" : null;
    const country = o.country === "RU" || o.country === "BY" ? o.country : null;
    const sql = await ydb();
    await sql`UPSERT INTO analytics_events (id, type, country, path, source, company_id, created_at)
              VALUES (${createId()}, ${type}, ${optText(country)}, ${optText(path)}, ${optText(source)}, ${optText(o.companyId)}, ${nowSec()})`;
  } catch (e) {
    console.error("[analytics] failed", type, e instanceof Error ? e.message : e);
  }
}
