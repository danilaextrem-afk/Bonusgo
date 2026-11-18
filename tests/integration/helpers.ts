import { sql } from "drizzle-orm";
import { db, schema } from "@/server/db";

/** In-memory request state used by the next/headers mock. */
export const reqState = {
  cookies: new Map<string, string>(),
  headers: new Map<string, string>(),
};

export const nextHeadersMock = {
  cookies: async () => ({
    get: (name: string) => (reqState.cookies.has(name) ? { name, value: reqState.cookies.get(name)! } : undefined),
    set: (name: string, value: string) => void reqState.cookies.set(name, value),
    delete: (name: string) => void reqState.cookies.delete(name),
  }),
  headers: async () => new Headers(Object.fromEntries(reqState.headers)),
};

export const nextNavigationMock = {
  redirect: (url: string) => {
    throw Object.assign(new Error(`NEXT_REDIRECT:${url}`), { digest: `NEXT_REDIRECT;${url}` });
  },
  notFound: () => {
    throw Object.assign(new Error("NEXT_NOT_FOUND"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
  },
};

export async function resetDb() {
  await db.execute(sql`TRUNCATE users, sessions, consents, companies, memberships, venues, programs, rewards, cards, customer_tokens, transactions,
    subscriptions, payments, payment_events, referrals, audit_logs, rate_limits, analytics_events RESTART IDENTITY CASCADE`);
  reqState.cookies.clear();
  reqState.headers.clear();
}

let seq = 0;
export async function makeUser(o: Partial<typeof schema.users.$inferInsert> = {}) {
  seq++;
  const [u] = await db.insert(schema.users).values({ email: `user${seq}-${Date.now()}@test.local`, passwordHash: "x", ...o }).returning();
  return u;
}

export async function makeCompany(
  ownerId: string,
  o: { country?: "RU" | "BY"; plan?: "FREE" | "PRO" | "TOP"; planExpiresAt?: Date | null; name?: string } = {},
) {
  const country = o.country ?? "RU";
  const [c] = await db
    .insert(schema.companies)
    .values({ name: o.name ?? "Кофейня", country, currency: country === "RU" ? "RUB" : "BYN", plan: o.plan ?? "FREE", planExpiresAt: o.planExpiresAt ?? null })
    .returning();
  await db.insert(schema.memberships).values({ userId: ownerId, companyId: c.id, role: "OWNER" });
  return c;
}

/** Owner + company + venue + program in one go. */
export async function makeSetup(o: { type?: "STAMPS" | "POINTS"; plan?: "FREE" | "PRO" | "TOP"; country?: "RU" | "BY"; stampsRequired?: number; pointsPercent?: number } = {}) {
  const owner = await makeUser();
  const company = await makeCompany(owner.id, { plan: o.plan ?? (o.type === "POINTS" ? "PRO" : "FREE"), country: o.country, planExpiresAt: o.plan === "FREE" ? null : new Date(Date.now() + 30 * 86400_000) });
  const [venue] = await db.insert(schema.venues).values({ companyId: company.id, name: "Точка", slug: `v-${company.id.slice(0, 8).toLowerCase()}-${seq}` }).returning();
  const [program] = await db
    .insert(schema.programs)
    .values({ companyId: company.id, venueId: venue.id, type: o.type ?? "STAMPS", name: "Программа", stampsRequired: o.stampsRequired ?? 10, pointsPercent: o.pointsPercent ?? 5 })
    .returning();
  return { owner, company, venue, program };
}

export function setOrigin(origin: string | null, host: string) {
  const h: Record<string, string> = { host };
  if (origin) h.origin = origin;
  return new Request(`https://${host}/api/x`, { method: "POST", headers: h });
}
