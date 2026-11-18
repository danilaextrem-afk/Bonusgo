import "server-only";
import { and, count, eq, gt, ne, sql } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { LimitError, NotFoundError } from "@/server/errors";
import { ACTIVE_CUSTOMER_DAYS, PLAN_LIMITS, type PlanId, type PlanLimits } from "@/lib/plans";

type Company = typeof schema.companies.$inferSelect;
/** db or a transaction: lets callers run checks on the connection that holds a lock. */
type Q = Pick<typeof db, "select" | "execute">;

/** Paid plan whose period has ended falls back to FREE. A paid plan with no expiry is treated as active. */
export function effectivePlan(c: Pick<Company, "plan" | "planExpiresAt">): PlanId {
  if (c.plan === "FREE") return "FREE";
  if (c.planExpiresAt && new Date(c.planExpiresAt).getTime() <= Date.now()) return "FREE";
  return c.plan;
}

async function loadCompany(companyId: string, q: Q = db): Promise<Company> {
  const rows = await q.select().from(schema.companies).where(eq(schema.companies.id, companyId)).limit(1);
  if (!rows[0] || rows[0].deletedAt) throw new NotFoundError("Компания не найдена.");
  return rows[0];
}

async function planOf(companyId: string, q: Q = db): Promise<{ plan: PlanId; limits: PlanLimits }> {
  const plan = effectivePlan(await loadCompany(companyId, q));
  return { plan, limits: PLAN_LIMITS[plan] };
}

function upgradeHint(plan: PlanId): string {
  return plan === "FREE" ? "Перейдите на PRO." : plan === "PRO" ? "Перейдите на TOP." : "Свяжитесь с поддержкой.";
}

function activeSince(): Date {
  return new Date(Date.now() - ACTIVE_CUSTOMER_DAYS * 86400_000);
}

async function countVenues(companyId: string, q: Q = db) {
  return Number((await q.select({ n: count() }).from(schema.venues).where(eq(schema.venues.companyId, companyId)))[0]?.n ?? 0);
}
async function countPrograms(companyId: string, q: Q = db) {
  return Number((await q.select({ n: count() }).from(schema.programs).where(eq(schema.programs.companyId, companyId)))[0]?.n ?? 0);
}
async function countStaff(companyId: string, q: Q = db) {
  return Number(
    (await q.select({ n: count() }).from(schema.memberships).where(and(eq(schema.memberships.companyId, companyId), ne(schema.memberships.role, "OWNER"))))[0]?.n ?? 0,
  );
}
async function countActiveCustomers(companyId: string) {
  const r = await db
    .select({ n: sql<number>`count(distinct ${schema.cards.customerId})` })
    .from(schema.cards)
    .where(and(eq(schema.cards.companyId, companyId), gt(schema.cards.lastActivityAt, activeSince())));
  return Number(r[0]?.n ?? 0);
}

export async function assertCanAddVenue(companyId: string, q: Q = db): Promise<void> {
  const { plan, limits } = await planOf(companyId, q);
  if ((await countVenues(companyId, q)) >= limits.venues) {
    throw new LimitError(`Лимит тарифа ${plan}: ${limits.venues} заведени${limits.venues === 1 ? "е" : "й"}. ${upgradeHint(plan)}`, "venues");
  }
}

export async function assertCanAddProgram(companyId: string, type: "STAMPS" | "POINTS", q: Q = db): Promise<void> {
  const { plan, limits } = await planOf(companyId, q);
  if (type === "POINTS" && !limits.pointsPrograms) throw new LimitError(`Бальные программы недоступны на тарифе ${plan}. ${upgradeHint(plan)}`, "pointsPrograms");
  if ((await countPrograms(companyId, q)) >= limits.programs) {
    throw new LimitError(`Лимит тарифа ${plan}: ${limits.programs} программ${limits.programs === 1 ? "а" : ""}. ${upgradeHint(plan)}`, "programs");
  }
}

export async function assertCanAddStaff(companyId: string, q: Q = db): Promise<void> {
  const { plan, limits } = await planOf(companyId, q);
  if ((await countStaff(companyId, q)) >= limits.staff) {
    throw new LimitError(
      limits.staff === 0 ? `Сотрудники недоступны на тарифе ${plan}. ${upgradeHint(plan)}` : `Лимит тарифа ${plan}: ${limits.staff} сотрудников. ${upgradeHint(plan)}`,
      "staff",
    );
  }
}

export async function assertCanAddActiveCustomer(companyId: string): Promise<void> {
  const { plan, limits } = await planOf(companyId);
  if ((await countActiveCustomers(companyId)) >= limits.activeCustomers) {
    throw new LimitError(`Лимит тарифа ${plan}: ${limits.activeCustomers} активных клиентов. ${upgradeHint(plan)}`, "activeCustomers");
  }
}

const FEATURE_NAMES: Partial<Record<keyof PlanLimits, string>> = {
  pointsPrograms: "Бальные программы", customBranding: "Свой брендинг", rewards: "Награды", history: "История операций",
  advancedAnalytics: "Расширенная аналитика", referrals: "Реферальная программа", export: "Экспорт данных", removeBranding: "Отключение брендинга BONUSGO", automation: "Автоматизация",
};

export async function assertFeature(companyId: string, feature: keyof PlanLimits): Promise<void> {
  const { plan, limits } = await planOf(companyId);
  const v = limits[feature];
  if (v === false || v === 0) throw new LimitError(`${FEATURE_NAMES[feature] ?? String(feature)}: недоступно на тарифе ${plan}. ${upgradeHint(plan)}`, String(feature));
}

export async function getUsage(companyId: string): Promise<{ venues: number; programs: number; staff: number; activeCustomers: number; limits: PlanLimits; plan: PlanId }> {
  const { plan, limits } = await planOf(companyId);
  const [venues, programs, staff, activeCustomers] = await Promise.all([countVenues(companyId), countPrograms(companyId), countStaff(companyId), countActiveCustomers(companyId)]);
  return { venues, programs, staff, activeCustomers, limits, plan };
}

/** Ids of the oldest `n` rows: what remains usable after a downgrade (extra items are frozen, not deleted). */
async function oldestIds(table: typeof schema.venues | typeof schema.programs, companyId: string, n: number): Promise<Set<string>> {
  if (n <= 0) return new Set();
  const rows = await db.select({ id: table.id }).from(table).where(eq(table.companyId, companyId)).orderBy(table.createdAt, table.id).limit(n);
  return new Set(rows.map((r) => r.id));
}

/**
 * Use-time plan enforcement for staff operations. Creation-time checks alone would let a company
 * keep using items created during a higher plan (e.g. an unconfirmed SBP grace period) after a downgrade.
 */
export async function assertOperationAllowed(
  company: Pick<Company, "id" | "plan" | "planExpiresAt">,
  program: { id: string; venueId: string; type: "STAMPS" | "POINTS" },
  membership: { id: string; role: "OWNER" | "MANAGER" | "STAFF" },
  opts: { usesReward?: boolean } = {},
): Promise<void> {
  const plan = effectivePlan(company);
  const limits = PLAN_LIMITS[plan];
  const frozen = (what: string) => new LimitError(`${what} недоступно на тарифе ${plan}. ${upgradeHint(plan)}`, "frozen");
  if (program.type === "POINTS" && !limits.pointsPrograms) throw frozen("Бальная программа");
  if (opts.usesReward && !limits.rewards) throw frozen("Списание наград");
  const [programs, venues] = await Promise.all([oldestIds(schema.programs, company.id, limits.programs), oldestIds(schema.venues, company.id, limits.venues)]);
  if (!programs.has(program.id)) throw frozen("Эта программа сверх лимита —");
  if (!venues.has(program.venueId)) throw frozen("Это заведение сверх лимита —");
  if (membership.role !== "OWNER") {
    const staff = await db
      .select({ id: schema.memberships.id })
      .from(schema.memberships)
      .where(and(eq(schema.memberships.companyId, company.id), ne(schema.memberships.role, "OWNER")))
      .orderBy(schema.memberships.createdAt, schema.memberships.id)
      .limit(Math.max(0, limits.staff));
    if (!staff.some((s) => s.id === membership.id)) throw frozen("Доступ сотрудника");
  }
}

/** Branding (logo/colour) on public pages follows the current plan. */
export function brandingAllowed(company: Pick<Company, "plan" | "planExpiresAt">): boolean {
  return PLAN_LIMITS[effectivePlan(company)].customBranding;
}

/** Serializes "check limit → insert" per company and resource, so parallel requests can't overshoot a limit. */
export async function withLimitLock<T>(companyId: string, resource: string, fn: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`limit:${resource}:${companyId}`}))`);
    return fn(tx);
  });
}
