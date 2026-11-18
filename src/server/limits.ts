import "server-only";
import { and, count, eq, gt, ne, sql } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { LimitError, NotFoundError } from "@/server/errors";
import { ACTIVE_CUSTOMER_DAYS, PLAN_LIMITS, type PlanId, type PlanLimits } from "@/lib/plans";

type Company = typeof schema.companies.$inferSelect;

/** Paid plan whose period has ended falls back to FREE. A paid plan with no expiry is treated as active. */
export function effectivePlan(c: Pick<Company, "plan" | "planExpiresAt">): PlanId {
  if (c.plan === "FREE") return "FREE";
  if (c.planExpiresAt && new Date(c.planExpiresAt).getTime() <= Date.now()) return "FREE";
  return c.plan;
}

async function loadCompany(companyId: string): Promise<Company> {
  const rows = await db.select().from(schema.companies).where(eq(schema.companies.id, companyId)).limit(1);
  if (!rows[0] || rows[0].deletedAt) throw new NotFoundError("Компания не найдена.");
  return rows[0];
}

async function planOf(companyId: string): Promise<{ plan: PlanId; limits: PlanLimits }> {
  const plan = effectivePlan(await loadCompany(companyId));
  return { plan, limits: PLAN_LIMITS[plan] };
}

function upgradeHint(plan: PlanId): string {
  return plan === "FREE" ? "Перейдите на PRO." : plan === "PRO" ? "Перейдите на TOP." : "Свяжитесь с поддержкой.";
}

function activeSince(): Date {
  return new Date(Date.now() - ACTIVE_CUSTOMER_DAYS * 86400_000);
}

async function countVenues(companyId: string) {
  return Number((await db.select({ n: count() }).from(schema.venues).where(eq(schema.venues.companyId, companyId)))[0]?.n ?? 0);
}
async function countPrograms(companyId: string) {
  return Number((await db.select({ n: count() }).from(schema.programs).where(eq(schema.programs.companyId, companyId)))[0]?.n ?? 0);
}
async function countStaff(companyId: string) {
  return Number(
    (await db.select({ n: count() }).from(schema.memberships).where(and(eq(schema.memberships.companyId, companyId), ne(schema.memberships.role, "OWNER"))))[0]?.n ?? 0,
  );
}
async function countActiveCustomers(companyId: string) {
  const r = await db
    .select({ n: sql<number>`count(distinct ${schema.cards.customerId})` })
    .from(schema.cards)
    .where(and(eq(schema.cards.companyId, companyId), gt(schema.cards.lastActivityAt, activeSince())));
  return Number(r[0]?.n ?? 0);
}

export async function assertCanAddVenue(companyId: string): Promise<void> {
  const { plan, limits } = await planOf(companyId);
  if ((await countVenues(companyId)) >= limits.venues) {
    throw new LimitError(`Лимит тарифа ${plan}: ${limits.venues} заведени${limits.venues === 1 ? "е" : "й"}. ${upgradeHint(plan)}`, "venues");
  }
}

export async function assertCanAddProgram(companyId: string, type: "STAMPS" | "POINTS"): Promise<void> {
  const { plan, limits } = await planOf(companyId);
  if (type === "POINTS" && !limits.pointsPrograms) throw new LimitError(`Бальные программы недоступны на тарифе ${plan}. ${upgradeHint(plan)}`, "pointsPrograms");
  if ((await countPrograms(companyId)) >= limits.programs) {
    throw new LimitError(`Лимит тарифа ${plan}: ${limits.programs} программ${limits.programs === 1 ? "а" : ""}. ${upgradeHint(plan)}`, "programs");
  }
}

export async function assertCanAddStaff(companyId: string): Promise<void> {
  const { plan, limits } = await planOf(companyId);
  if ((await countStaff(companyId)) >= limits.staff) {
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
