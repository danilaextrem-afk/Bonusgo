import { ydb } from "@/server/ydb/client";
import { createId } from "@/server/id";
import { nowSec, optDate, optText } from "@/server/ydb/values";
export { nextHeadersMock, nextNavigationMock, reqState, setOrigin } from "../integration/helpers";

const TABLES = [
  "users", "users_by_email", "sessions", "consents", "companies", "memberships", "venues", "venues_by_slug", "programs", "rewards",
  "cards", "customer_tokens", "transactions", "idempotency_keys", "subscriptions", "payments", "counters", "payment_events",
  "referrals", "password_resets", "audit_logs", "rate_limits", "analytics_events",
];

export async function resetYdb() {
  const sql = await ydb();
  for (const t of TABLES) await sql`DELETE FROM ${sql.identifier(t)}`;
}

let seq = 0;
export async function makeUser(o: { email?: string; platformRole?: "USER" | "ADMIN"; passwordHash?: string; name?: string | null } = {}) {
  const sql = await ydb();
  seq++;
  const id = createId();
  const email = o.email ?? `user${seq}-${Date.now()}@test.local`;
  const now = nowSec();
  await sql`UPSERT INTO users (id, email, password_hash, name, platform_role, country, invite_code, created_at)
            VALUES (${id}, ${email}, ${o.passwordHash ?? "x"}, ${optText(o.name ?? null)}, ${o.platformRole ?? "USER"}, ${"RU"}, ${createId()}, ${now})`;
  await sql`UPSERT INTO users_by_email (email, user_id) VALUES (${email}, ${id})`;
  return { id, email, passwordHash: o.passwordHash ?? "x", name: o.name ?? null, platformRole: o.platformRole ?? "USER", country: "RU" as const, createdAt: now, deletedAt: null };
}

export async function makeCompany(ownerId: string, o: { country?: "RU" | "BY"; plan?: "FREE" | "PRO" | "TOP"; planExpiresAt?: Date | null; name?: string } = {}) {
  const sql = await ydb();
  const id = createId();
  const country = o.country ?? "RU";
  const now = nowSec();
  const c = {
    id, name: o.name ?? "Кофейня", country, currency: country === "RU" ? "RUB" : "BYN", plan: o.plan ?? "FREE",
    planExpiresAt: o.planExpiresAt ? new Date(Math.floor(o.planExpiresAt.getTime() / 1000) * 1000) : null, referralCode: createId(), createdAt: now,
  };
  await sql`UPSERT INTO companies (id, name, country, currency, plan, plan_expires_at, referral_code, created_at)
            VALUES (${id}, ${c.name}, ${country}, ${c.currency}, ${c.plan}, ${optDate(c.planExpiresAt)}, ${c.referralCode}, ${now})`;
  await sql`UPSERT INTO memberships (company_id, user_id, id, role, created_at) VALUES (${id}, ${ownerId}, ${createId()}, ${"OWNER"}, ${now})`;
  return c;
}

/** Owner + company + venue + program. */
export async function makeSetup(o: { type?: "STAMPS" | "POINTS"; plan?: "FREE" | "PRO" | "TOP"; country?: "RU" | "BY"; stampsRequired?: number; pointsPercent?: number } = {}) {
  const sql = await ydb();
  const owner = await makeUser();
  const plan = o.plan ?? (o.type === "POINTS" ? "PRO" : "FREE");
  const company = await makeCompany(owner.id, { plan, country: o.country, planExpiresAt: plan === "FREE" ? null : new Date(Date.now() + 30 * 86400_000) });
  const now = nowSec();
  const venue = { id: createId(), companyId: company.id, name: "Точка", slug: `v-${createId().slice(0, 8).toLowerCase()}` };
  await sql`UPSERT INTO venues (id, company_id, name, slug, brand_color, created_at) VALUES (${venue.id}, ${company.id}, ${venue.name}, ${venue.slug}, ${"#39FF88"}, ${now})`;
  await sql`UPSERT INTO venues_by_slug (slug, venue_id) VALUES (${venue.slug}, ${venue.id})`;
  const program = {
    id: createId(), companyId: company.id, venueId: venue.id, type: o.type ?? "STAMPS", name: "Программа",
    stampsRequired: o.stampsRequired ?? 10, pointsPercent: o.pointsPercent ?? 5, rewardText: "Подарок", active: true,
  };
  await sql`UPSERT INTO programs (id, company_id, venue_id, type, name, stamps_required, points_percent, reward_text, active, created_at)
            VALUES (${program.id}, ${company.id}, ${venue.id}, ${program.type}, ${program.name}, ${program.stampsRequired}, ${program.pointsPercent}, ${program.rewardText}, ${true}, ${now})`;
  return { owner, company, venue, program };
}
