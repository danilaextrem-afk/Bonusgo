import "server-only";
import type { SQL, TX } from "@ydbjs/query";
import type { db } from "@/server/db";
import { LimitError, NotFoundError } from "@/server/errors";
import { ydb } from "@/server/ydb/client";
import { camel, type Company } from "@/server/ydb/rows";
import { num } from "@/server/ydb/values";
import { ACTIVE_CUSTOMER_DAYS, PLAN_LIMITS, type PlanId, type PlanLimits } from "@/lib/plans";

/** The YDB client or a transaction (`sql.begin` callback arg): checks run inside the caller's tx. */
type Q = SQL;
type Row = Record<string, unknown>;
/** `sql.begin` wraps non-retryable errors (incl. our AppErrors) as Error("Transaction failed.", { cause }): unwrap. */
const unwrapTx = (e: unknown): unknown => (e instanceof Error && e.message === "Transaction failed." && e.cause !== undefined ? e.cause : e);
const conn = async (q?: Q): Promise<Q> => q ?? (await ydb());

/** Paid plan whose period has ended falls back to FREE. A paid plan with no expiry is treated as active. */
export function effectivePlan(c: Pick<Company, "plan" | "planExpiresAt">): PlanId {
  if (c.plan === "FREE") return "FREE";
  if (c.planExpiresAt && new Date(c.planExpiresAt).getTime() <= Date.now()) return "FREE";
  return c.plan;
}

async function loadCompany(companyId: string, q?: Q): Promise<Company> {
  const sql = await conn(q);
  const [[row]] = await sql<[Row]>`SELECT * FROM companies WHERE id = ${companyId}`;
  const c = row ? camel<Company>(row) : null;
  if (!c || c.deletedAt) throw new NotFoundError("Компания не найдена.");
  return c;
}

async function planOf(companyId: string, q?: Q): Promise<{ plan: PlanId; limits: PlanLimits }> {
  const plan = effectivePlan(await loadCompany(companyId, q));
  return { plan, limits: PLAN_LIMITS[plan] };
}

function upgradeHint(plan: PlanId): string {
  return plan === "FREE" ? "Перейдите на PRO." : plan === "PRO" ? "Перейдите на TOP." : "Свяжитесь с поддержкой.";
}

function activeSince(): Date {
  return new Date(Date.now() - ACTIVE_CUSTOMER_DAYS * 86400_000);
}

async function countVenues(companyId: string, q?: Q) {
  const sql = await conn(q);
  const [[r]] = await sql<[{ n: bigint }]>`SELECT COUNT(*) AS n FROM venues VIEW idx_company WHERE company_id = ${companyId}`;
  return num(r?.n);
}
async function countPrograms(companyId: string, q?: Q) {
  const sql = await conn(q);
  const [[r]] = await sql<[{ n: bigint }]>`SELECT COUNT(*) AS n FROM programs VIEW idx_company WHERE company_id = ${companyId}`;
  return num(r?.n);
}
async function countStaff(companyId: string, q?: Q) {
  const sql = await conn(q);
  const [[r]] = await sql<[{ n: bigint }]>`SELECT COUNT(*) AS n FROM memberships WHERE company_id = ${companyId} AND role != ${"OWNER"}`;
  return num(r?.n);
}
async function countActiveCustomers(companyId: string, q?: Q) {
  const sql = await conn(q);
  const [[r]] = await sql<[{ n: bigint }]>`
    SELECT COUNT(DISTINCT customer_id) AS n FROM cards VIEW idx_company WHERE company_id = ${companyId} AND last_activity_at > ${activeSince()}`;
  return num(r?.n);
}

export async function assertCanAddVenue(companyId: string, q?: Q): Promise<void> {
  const { plan, limits } = await planOf(companyId, q);
  if ((await countVenues(companyId, q)) >= limits.venues) {
    throw new LimitError(`Лимит тарифа ${plan}: ${limits.venues} заведени${limits.venues === 1 ? "е" : "й"}. ${upgradeHint(plan)}`, "venues");
  }
}

export async function assertCanAddProgram(companyId: string, type: "STAMPS" | "POINTS", q?: Q): Promise<void> {
  const { plan, limits } = await planOf(companyId, q);
  if (type === "POINTS" && !limits.pointsPrograms) throw new LimitError(`Бальные программы недоступны на тарифе ${plan}. ${upgradeHint(plan)}`, "pointsPrograms");
  if ((await countPrograms(companyId, q)) >= limits.programs) {
    throw new LimitError(`Лимит тарифа ${plan}: ${limits.programs} программ${limits.programs === 1 ? "а" : ""}. ${upgradeHint(plan)}`, "programs");
  }
}

export async function assertCanAddStaff(companyId: string, q?: Q): Promise<void> {
  const { plan, limits } = await planOf(companyId, q);
  if ((await countStaff(companyId, q)) >= limits.staff) {
    throw new LimitError(
      limits.staff === 0 ? `Сотрудники недоступны на тарифе ${plan}. ${upgradeHint(plan)}` : `Лимит тарифа ${plan}: ${limits.staff} сотрудников. ${upgradeHint(plan)}`,
      "staff",
    );
  }
}

export async function assertCanAddActiveCustomer(companyId: string, q?: Q): Promise<void> {
  const { plan, limits } = await planOf(companyId, q);
  if ((await countActiveCustomers(companyId, q)) >= limits.activeCustomers) {
    throw new LimitError(`Лимит тарифа ${plan}: ${limits.activeCustomers} активных клиентов. ${upgradeHint(plan)}`, "activeCustomers");
  }
}

const FEATURE_NAMES: Partial<Record<keyof PlanLimits, string>> = {
  pointsPrograms: "Бальные программы", customBranding: "Свой брендинг", rewards: "Награды", history: "История операций",
  advancedAnalytics: "Расширенная аналитика", referrals: "Реферальная программа", export: "Экспорт данных", removeBranding: "Отключение брендинга QRonus", automation: "Автоматизация",
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
async function oldestIds(table: "venues" | "programs", companyId: string, n: number): Promise<Set<string>> {
  if (n <= 0) return new Set();
  const sql = await ydb();
  const limit = sql.unsafe(String(Math.min(Math.floor(n), 1_000_000)));
  const [rows] = await sql<[{ id: string }]>`
    SELECT id FROM ${sql.identifier(table)} VIEW idx_company WHERE company_id = ${companyId} ORDER BY created_at, id LIMIT ${limit}`;
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
  const [programs, venues] = await Promise.all([oldestIds("programs", company.id, limits.programs), oldestIds("venues", company.id, limits.venues)]);
  if (!programs.has(program.id)) throw frozen("Эта программа сверх лимита —");
  if (!venues.has(program.venueId)) throw frozen("Это заведение сверх лимита —");
  if (membership.role !== "OWNER") {
    const n = Math.max(0, Math.min(Math.floor(limits.staff), 1_000_000));
    let staff: { id: string }[] = [];
    if (n > 0) {
      const sql = await ydb();
      [staff] = await sql<[{ id: string }]>`
        SELECT id FROM memberships WHERE company_id = ${company.id} AND role != ${"OWNER"} ORDER BY created_at, id LIMIT ${sql.unsafe(String(n))}`;
    }
    if (!staff.some((s) => s.id === membership.id)) throw frozen("Доступ сотрудника");
  }
}

/** Branding (logo/colour) on public pages follows the current plan. */
export function brandingAllowed(company: Pick<Company, "plan" | "planExpiresAt">): boolean {
  return PLAN_LIMITS[effectivePlan(company)].customBranding;
}

/**
 * Transaction handed to `withLimitLock` callbacks: a YDB tx. TRANSITIONAL: it is also typed as the old
 * Drizzle tx only so not-yet-migrated callers (loyalty/service.ts) still typecheck; at runtime it is a YDB
 * tx only. Drop the Drizzle half once loyalty is migrated.
 */
type DrizzleTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type LimitTx = TX & DrizzleTx;

/**
 * "check limit → insert" in one serializable YDB transaction: the limit check reads the company's rows
 * inside the tx, so a parallel insert aborts (and retries) one of the transactions — no overshoot.
 * The callback may be retried: keep it free of side effects outside the DB.
 */
export async function withLimitLock<T>(companyId: string, resource: string, fn: (tx: LimitTx) => Promise<T>): Promise<T> {
  void companyId;
  void resource;
  const sql = await ydb();
  return sql.begin((tx) => fn(tx as LimitTx)).catch((e) => {
    throw unwrapTx(e);
  });
}
