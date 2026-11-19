import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, asc, count, desc, eq, gt, gte, ilike, inArray, isNull, like, lt, or, sql } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { AppError, ForbiddenError, LimitError, NotFoundError } from "@/server/errors";
import { audit } from "@/server/audit";
import { notifyOwner } from "@/server/notify";
import { rateLimit } from "@/server/security/rateLimit";
import { trackEvent } from "./analytics";
import { MAX_EXPORT_ROWS, assertCompleteExport } from "./export-limits";
import { parseExportPeriod } from "./export-period";
import { assertCanAddProgram, assertCanAddStaff, assertCanAddVenue, assertFeature, assertOperationAllowed, brandingAllowed, effectivePlan, withLimitLock } from "@/server/limits";
import { ACTIVE_CUSTOMER_DAYS, COUNTRY, PLAN_LIMITS, PLAN_PRICES, type CountryCode } from "@/lib/plans";
import { MAX_PURCHASE_MINOR, computePoints, csvRow, isValidColor, isValidLogoUrl, maskEmail, parseCustomerToken, slugify } from "./utils";

export { slugify, computePoints, csvCell, maskEmail, parseCustomerToken } from "./utils";

type Company = typeof schema.companies.$inferSelect;
type Card = typeof schema.cards.$inferSelect;
type Tx = typeof schema.transactions.$inferSelect;
type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const CUSTOMER_TOKEN_TTL_MS = 5 * 60 * 1000;
const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

function isUniqueViolation(e: unknown): boolean {
  const err = e as { code?: string; cause?: { code?: string } };
  return err?.code === "23505" || err?.cause?.code === "23505";
}

function text(v: unknown, max: number, field: string, required = true): string | undefined {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) {
    if (required) throw new AppError("VALIDATION", `Заполните поле «${field}».`);
    return undefined;
  }
  if (s.length > max) throw new AppError("VALIDATION", `Поле «${field}» слишком длинное (макс. ${max}).`);
  return s;
}

function intIn(v: unknown, min: number, max: number, msg: string): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new AppError("VALIDATION", msg);
  return n;
}

async function getCompany(companyId: string, q: typeof db | DbTx = db): Promise<Company> {
  const r = await q.select().from(schema.companies).where(and(eq(schema.companies.id, companyId), isNull(schema.companies.deletedAt))).limit(1);
  if (!r[0]) throw new NotFoundError("Компания не найдена.");
  return r[0];
}

// ───────────────────────── Company / venue / program setup ─────────────────────────

export async function createCompany(
  userId: string,
  i: { name: string; country: "RU" | "BY"; legalName?: string; taxId?: string; referralCode?: string },
): Promise<Company> {
  const name = text(i.name, 120, "Название")!;
  if (i.country !== "RU" && i.country !== "BY") throw new AppError("VALIDATION", "Выберите страну.");
  const legalName = text(i.legalName, 200, "Юр. название", false);
  const taxId = text(i.taxId, 20, COUNTRY[i.country].taxIdLabel, false);
  if (taxId && !/^\d{9,12}$/.test(taxId)) throw new AppError("VALIDATION", `${COUNTRY[i.country].taxIdLabel}: только цифры (9–12).`);

  const company = await db.transaction(async (tx) => {
    let referrer: Company | undefined;
    const code = i.referralCode?.trim();
    if (code && code.length <= 64) {
      referrer = (await tx.select().from(schema.companies).where(and(eq(schema.companies.referralCode, code), isNull(schema.companies.deletedAt))).limit(1))[0];
      // Self-referral guard: referrer must not be owned by the same user.
      if (referrer) {
        const own = await tx.select({ id: schema.memberships.id }).from(schema.memberships)
          .where(and(eq(schema.memberships.companyId, referrer.id), eq(schema.memberships.userId, userId))).limit(1);
        if (own[0]) referrer = undefined;
      }
    }
    const [c] = await tx
      .insert(schema.companies)
      .values({ name, country: i.country, currency: COUNTRY[i.country].currency, legalName: legalName ?? null, taxId: taxId ?? null, referredById: referrer?.id ?? null })
      .returning();
    await tx.insert(schema.memberships).values({ userId, companyId: c.id, role: "OWNER" });
    if (referrer) await tx.insert(schema.referrals).values({ referrerCompanyId: referrer.id, referredCompanyId: c.id });
    return c;
  });
  void notifyOwner(`🆕 Новый бизнес: ${company.name} (${COUNTRY[company.country].name})`);
  await audit("company.create", { actorUserId: userId, companyId: company.id, meta: { country: company.country, referred: !!company.referredById } });
  await trackEvent("signup_business", { country: company.country, companyId: company.id, source: company.referredById ? "referral" : undefined });
  return company;
}

export async function createVenue(companyId: string, i: { name: string; address?: string; brandColor?: string; logoUrl?: string }) {
  const name = text(i.name, 120, "Название")!;
  const address = text(i.address, 300, "Адрес", false);
  if (i.brandColor && !isValidColor(i.brandColor)) throw new AppError("VALIDATION", "Цвет должен быть в формате #RRGGBB.");
  if (i.logoUrl && !isValidLogoUrl(i.logoUrl)) throw new AppError("VALIDATION", "Логотип: https-ссылка или PNG/JPEG/WebP до 200 КБ.");
  await getCompany(companyId);
  const v = await withLimitLock(companyId, "venue", async (tx) => {
    await assertCanAddVenue(companyId, tx);
    const base = slugify(name);
    for (let attempt = 0; attempt < 5; attempt++) {
      const slug = `${base}-${randomBytes(3).toString("hex")}`;
      try {
        // Savepoint: a slug collision must not abort the whole locked transaction.
        return await tx.transaction(async (sp) =>
          (await sp.insert(schema.venues).values({ companyId, name, address: address ?? null, slug, brandColor: i.brandColor ?? "#39FF88", logoUrl: i.logoUrl ?? null }).returning())[0],
        );
      } catch (e) {
        if (!isUniqueViolation(e)) throw e;
      }
    }
    throw new AppError("SLUG_CONFLICT", "Не удалось создать адрес страницы. Повторите попытку.");
  });
  await audit("venue.create", { companyId, meta: { venueId: v.id } });
  return v;
}

export async function createProgram(
  companyId: string,
  i: { venueId: string; type: "STAMPS" | "POINTS"; name: string; stampsRequired?: number; pointsPercent?: number; rewardText: string },
) {
  if (i.type !== "STAMPS" && i.type !== "POINTS") throw new AppError("VALIDATION", "Неизвестный тип программы.");
  const name = text(i.name, 120, "Название")!;
  const rewardText = text(i.rewardText, 200, "Награда", i.type === "STAMPS") ?? "Подарок";
  const stampsRequired = i.type === "STAMPS" ? intIn(i.stampsRequired ?? 10, 3, 30, "Количество штампов — от 3 до 30.") : 10;
  const pointsPercent = i.type === "POINTS" ? intIn(i.pointsPercent ?? 5, 1, 50, "Процент начисления — от 1 до 50.") : 5;
  const venue = (await db.select().from(schema.venues).where(and(eq(schema.venues.id, i.venueId), eq(schema.venues.companyId, companyId))).limit(1))[0];
  if (!venue) throw new NotFoundError("Заведение не найдено.");
  const { p, before } = await withLimitLock(companyId, "program", async (tx) => {
    await assertCanAddProgram(companyId, i.type, tx);
    const before = Number((await tx.select({ n: count() }).from(schema.programs).where(eq(schema.programs.companyId, companyId)))[0]?.n ?? 0);
    const [p] = await tx.insert(schema.programs).values({ companyId, venueId: venue.id, type: i.type, name, stampsRequired, pointsPercent, rewardText }).returning();
    return { p, before };
  });
  await audit("program.create", { companyId, meta: { programId: p.id, type: p.type } });
  if (before === 0) {
    const c = await getCompany(companyId);
    await trackEvent("first_card", { country: c.country, companyId });
  }
  return p;
}

export async function createReward(companyId: string, i: { programId: string; title: string; cost: number }) {
  const title = text(i.title, 120, "Название награды")!;
  const cost = intIn(i.cost, 1, 1_000_000, "Стоимость награды — от 1 до 1 000 000 баллов.");
  const prog = (await db.select().from(schema.programs).where(and(eq(schema.programs.id, i.programId), eq(schema.programs.companyId, companyId))).limit(1))[0];
  if (!prog) throw new NotFoundError("Программа не найдена.");
  await assertFeature(companyId, "rewards");
  const [r] = await db.insert(schema.rewards).values({ companyId, programId: prog.id, title, cost }).returning();
  await audit("reward.create", { companyId, meta: { rewardId: r.id } });
  return r;
}

export async function addStaff(companyId: string, i: { email: string; role: "MANAGER" | "STAFF"; venueId?: string }) {
  if (i.role !== "MANAGER" && i.role !== "STAFF") throw new AppError("VALIDATION", "Неизвестная роль.");
  const email = String(i.email ?? "").trim().toLowerCase();
  const user = (await db.select().from(schema.users).where(and(eq(schema.users.email, email), isNull(schema.users.deletedAt))).limit(1))[0];
  if (!user) throw new NotFoundError("Пользователь с таким email не найден. Попросите сотрудника сначала зарегистрироваться.");
  let venueId: string | null = null;
  if (i.venueId) {
    const v = (await db.select({ id: schema.venues.id }).from(schema.venues).where(and(eq(schema.venues.id, i.venueId), eq(schema.venues.companyId, companyId))).limit(1))[0];
    if (!v) throw new NotFoundError("Заведение не найдено.");
    venueId = v.id;
  }
  const existing = (await db.select().from(schema.memberships).where(and(eq(schema.memberships.companyId, companyId), eq(schema.memberships.userId, user.id))).limit(1))[0];
  if (existing) throw new AppError("ALREADY_MEMBER", "Этот пользователь уже в команде.", 409);
  try {
    const m = await withLimitLock(companyId, "staff", async (tx) => {
      await assertCanAddStaff(companyId, tx);
      return (await tx.insert(schema.memberships).values({ companyId, userId: user.id, role: i.role, venueId }).returning())[0];
    });
    await audit("staff.add", { companyId, meta: { userId: user.id, role: i.role } });
    return m;
  } catch (e) {
    if (isUniqueViolation(e)) throw new AppError("ALREADY_MEMBER", "Этот пользователь уже в команде.", 409);
    throw e;
  }
}

// ───────────────────────── Public & customer side ─────────────────────────

export async function getPublicProgramByVenueSlug(slug: string) {
  if (!slug || slug.length > 80) return null;
  const row = (
    await db
      .select({ venue: schema.venues, company: schema.companies })
      .from(schema.venues)
      .innerJoin(schema.companies, eq(schema.companies.id, schema.venues.companyId))
      .where(and(eq(schema.venues.slug, slug), isNull(schema.companies.deletedAt)))
      .limit(1)
  )[0];
  if (!row) return null;
  const progs = await db.select().from(schema.programs)
    .where(and(eq(schema.programs.venueId, row.venue.id), eq(schema.programs.active, true))).orderBy(asc(schema.programs.createdAt));
  const rws = progs.length
    ? await db.select().from(schema.rewards).where(and(inArray(schema.rewards.programId, progs.map((p) => p.id)), eq(schema.rewards.active, true))).orderBy(asc(schema.rewards.cost))
    : [];
  const plan = effectivePlan(row.company);
  const removeBranding = PLAN_LIMITS[plan].removeBranding;
  const v = row.venue;
  return {
    // Custom logo/colour only while the plan includes branding (frozen after a downgrade).
    venue: { id: v.id, name: v.name, slug: v.slug, address: v.address, logoUrl: brandingAllowed(row.company) ? v.logoUrl : null, brandColor: brandingAllowed(row.company) ? v.brandColor : "#39FF88" },
    company: { id: row.company.id, name: row.company.name, country: row.company.country, plan, removeBranding },
    plan,
    showBranding: !removeBranding,
    programs: progs.map((p) => ({
      id: p.id, type: p.type, name: p.name, stampsRequired: p.stampsRequired, pointsPercent: p.pointsPercent, rewardText: p.rewardText,
      rewards: rws.filter((r) => r.programId === p.id).map((r) => ({ id: r.id, title: r.title, cost: r.cost })),
    })),
  };
}

/** Inserts a card if missing (limit-checked) and returns it locked FOR UPDATE. */
async function ensureCardLocked(tx: DbTx, program: typeof schema.programs.$inferSelect, customerId: string): Promise<{ card: Card; created: boolean }> {
  const lock = async () =>
    (await tx.select().from(schema.cards).where(and(eq(schema.cards.programId, program.id), eq(schema.cards.customerId, customerId))).for("update").limit(1))[0];
  const existing = await lock();
  if (existing) return { card: existing, created: false };
  await assertCanAddActiveCustomerTx(tx, program.companyId);
  const ins = await tx.insert(schema.cards).values({ companyId: program.companyId, programId: program.id, customerId }).onConflictDoNothing().returning();
  const card = await lock();
  if (!card) throw new AppError("CARD_ERROR", "Не удалось создать карту.", 500);
  return { card, created: ins.length > 0 };
}

async function assertCanAddActiveCustomerTx(tx: DbTx, companyId: string) {
  // Serialize new-customer creation per company so concurrent joins can't overshoot the limit.
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"cust:" + companyId}))`);
  const c = await getCompany(companyId, tx);
  const plan = effectivePlan(c);
  const lim = PLAN_LIMITS[plan].activeCustomers;
  const since = new Date(Date.now() - ACTIVE_CUSTOMER_DAYS * 86400_000);
  const r = await tx.select({ n: sql<number>`count(distinct ${schema.cards.customerId})` }).from(schema.cards)
    .where(and(eq(schema.cards.companyId, companyId), gt(schema.cards.lastActivityAt, since)));
  if (Number(r[0]?.n ?? 0) >= lim) {
    throw new LimitError(`Лимит тарифа ${plan}: ${lim} активных клиентов. ${plan === "FREE" ? "Перейдите на PRO." : plan === "PRO" ? "Перейдите на TOP." : "Свяжитесь с поддержкой."}`, "activeCustomers");
  }
}

async function maybeVenueActivated(companyId: string, createdCard: boolean) {
  if (!createdCard) return;
  const n = Number((await db.select({ n: count() }).from(schema.cards).where(eq(schema.cards.companyId, companyId)))[0]?.n ?? 0);
  if (n === 1) {
    const c = await getCompany(companyId);
    await trackEvent("venue_activated", { country: c.country, companyId });
  }
}

export async function joinProgram(customerId: string, programId: string): Promise<Card> {
  const program = (await db.select().from(schema.programs).where(and(eq(schema.programs.id, programId), eq(schema.programs.active, true))).limit(1))[0];
  if (!program) throw new NotFoundError("Программа не найдена.");
  await getCompany(program.companyId);
  const res = await db.transaction(async (tx) => ensureCardLocked(tx, program, customerId));
  if (res.created) await audit("card.join", { actorUserId: customerId, companyId: program.companyId, meta: { cardId: res.card.id } });
  await maybeVenueActivated(program.companyId, res.created);
  return res.card;
}

export async function issueCustomerToken(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const rl = await rateLimit(`qr:${userId}`, 20, 3600);
  if (!rl.ok) throw new AppError("RATE_LIMITED", `Слишком много QR-кодов. Повторите через ${Math.ceil(rl.retryAfter / 60)} мин.`, 429);
  const token = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + CUSTOMER_TOKEN_TTL_MS);
  await db.insert(schema.customerTokens).values({ userId, tokenHash: sha256(token), expiresAt });
  return { token, expiresAt };
}

// ───────────────────────── Staff operations ─────────────────────────

type OpInput = { actorUserId: string; companyId: string; programId: string; customerToken: string; idempotencyKey: string };

async function prepareOp(i: OpInput) {
  const key = String(i.idempotencyKey ?? "").trim();
  if (key.length < 8 || key.length > 100) throw new AppError("VALIDATION", "Некорректный ключ операции.");
  const m = (await db.select().from(schema.memberships).where(and(eq(schema.memberships.userId, i.actorUserId), eq(schema.memberships.companyId, i.companyId))).limit(1))[0];
  if (!m) throw new ForbiddenError("Нет доступа к этой компании.");
  const company = await getCompany(i.companyId);
  const program = (await db.select().from(schema.programs).where(and(eq(schema.programs.id, i.programId), eq(schema.programs.companyId, i.companyId))).limit(1))[0];
  if (!program) throw new NotFoundError("Программа не найдена.");
  if (!program.active) throw new AppError("PROGRAM_INACTIVE", "Программа отключена.");
  if (m.role === "STAFF" && m.venueId && m.venueId !== program.venueId) throw new ForbiddenError("Эта программа относится к другому заведению.");
  const usesReward = Boolean((i as { rewardId?: string }).rewardId);
  await assertOperationAllowed(company, program, m, { usesReward });
  return { key, membership: m, company, program };
}

async function findDuplicate(i: OpInput, key: string, expectedType: "ACCRUE" | "REDEEM"): Promise<{ card: Card; transaction: Tx; duplicated: true } | null> {
  const tx = (await db.select().from(schema.transactions).where(eq(schema.transactions.idempotencyKey, key)).limit(1))[0];
  if (!tx) return null;
  if (tx.companyId !== i.companyId) throw new ForbiddenError("Ключ операции уже использован.");
  // Retrying a request is safe only within the same actor, action and program.
  // A reused key must not silently return an unrelated payment/loyalty operation.
  if (tx.staffUserId !== i.actorUserId || tx.type !== expectedType)
    throw new AppError("IDEMPOTENCY_CONFLICT", "Ключ операции уже использован для другого действия.", 409);
  const card = (await db.select().from(schema.cards)
    .where(and(eq(schema.cards.id, tx.cardId), eq(schema.cards.companyId, i.companyId), eq(schema.cards.programId, i.programId))).limit(1))[0];
  if (!card) throw new AppError("IDEMPOTENCY_CONFLICT", "Ключ операции уже использован для другой программы или карта недоступна.", 409);

  // A duplicate cannot be authenticated only by a reusable idempotency key.
  // Require a QR token that was actually issued to this SAME customer.
  // Consumed tokens remain queryable until routine expiration cleanup, so
  // legitimate retries (including a newly issued QR for the same customer)
  // still return the original result without consuming another token.
  const bare = parseCustomerToken(i.customerToken);
  if (!bare) throw new AppError("IDEMPOTENCY_CONFLICT", "Ключ операции уже использован с другим QR-кодом.", 409);
  const tokenOwner = (await db.select({ userId: schema.customerTokens.userId })
    .from(schema.customerTokens)
    .where(eq(schema.customerTokens.tokenHash, sha256(bare)))
    .limit(1))[0];
  if (!tokenOwner || tokenOwner.userId !== card.customerId)
    throw new AppError("IDEMPOTENCY_CONFLICT", "Ключ операции уже использован для другого клиента или QR-код недействителен.", 409);
  return { card, transaction: tx, duplicated: true };
}

async function consumeToken(tx: DbTx, raw: string): Promise<string> {
  const bare = parseCustomerToken(raw);
  if (!bare) throw new AppError("INVALID_TOKEN", "QR-код недействителен. Попросите клиента обновить код.");
  const r = await tx.execute(sql`UPDATE customer_tokens SET used_at = now() WHERE token_hash = ${sha256(bare)} AND used_at IS NULL AND expires_at > now() RETURNING user_id`);
  const userId = (r.rows[0] as { user_id?: string } | undefined)?.user_id;
  if (!userId) throw new AppError("INVALID_TOKEN", "QR-код недействителен или уже использован. Попросите клиента обновить код.");
  const u = (await tx.select({ id: schema.users.id, deletedAt: schema.users.deletedAt }).from(schema.users).where(eq(schema.users.id, userId)).limit(1))[0];
  if (!u || u.deletedAt) throw new AppError("INVALID_TOKEN", "Клиент не найден.");
  return userId;
}

async function runOp(
  i: OpInput,
  body: (tx: DbTx, ctx: Awaited<ReturnType<typeof prepareOp>>, card: Card) => Promise<{ amount: number; type: "ACCRUE" | "REDEEM"; purchaseMinor?: number; note?: string }>,
  action: string,
  expectedType: "ACCRUE" | "REDEEM",
) {
  const ctx = await prepareOp(i);
  const dup = await findDuplicate(i, ctx.key, expectedType);
  if (dup) return dup;
  const rl = await rateLimit(`staff-op:${i.actorUserId}`, 60, 60);
  if (!rl.ok) throw new AppError("RATE_LIMITED", "Слишком много операций. Подождите минуту.", 429);
  let created = false;
  try {
    const out = await db.transaction(async (tx) => {
      const customerId = await consumeToken(tx, i.customerToken);
      const ensured = await ensureCardLocked(tx, ctx.program, customerId);
      created = ensured.created;
      const op = await body(tx, ctx, ensured.card);
      const now = new Date();
      const [card] = await tx.update(schema.cards).set({ balance: sql`${schema.cards.balance} + ${op.amount}`, lastActivityAt: now }).where(eq(schema.cards.id, ensured.card.id)).returning();
      if (card.balance < 0) throw new AppError("INSUFFICIENT_BALANCE", "Недостаточно баллов.");
      const [transaction] = await tx.insert(schema.transactions).values({
        companyId: i.companyId, cardId: card.id, type: op.type, amount: op.amount, purchaseMinor: op.purchaseMinor ?? null, staffUserId: i.actorUserId, idempotencyKey: ctx.key, note: op.note ?? null,
      }).returning();
      return { card, transaction, duplicated: false as boolean };
    });
    await audit(action, { actorUserId: i.actorUserId, companyId: i.companyId, meta: { cardId: out.card.id, txId: out.transaction.id, amount: out.transaction.amount } });
    await maybeVenueActivated(i.companyId, created);
    return out;
  } catch (e) {
    if (isUniqueViolation(e)) {
      const d = await findDuplicate(i, ctx.key, expectedType);
      if (d) return d;
    }
    throw e;
  }
}

export async function accrue(i: OpInput & { purchaseMinor?: number; stamps?: number }): Promise<{ card: Card; transaction: Tx; duplicated: boolean }> {
  return runOp(i, async (_tx, { program }) => {
    if (program.type === "STAMPS") {
      const stamps = intIn(i.stamps ?? 1, 1, 5, "За один раз можно начислить от 1 до 5 штампов.");
      return { type: "ACCRUE", amount: stamps };
    }
    const purchase = intIn(i.purchaseMinor, 1, MAX_PURCHASE_MINOR, "Сумма покупки указана неверно.");
    const pts = computePoints(purchase, program.pointsPercent);
    return { type: "ACCRUE", amount: pts, purchaseMinor: purchase };
  }, "card.accrue", "ACCRUE");
}

export async function redeem(i: OpInput & { rewardId?: string }): Promise<{ card: Card; transaction: Tx; duplicated: boolean }> {
  return runOp(i, async (tx, { program }, card) => {
    if (program.type === "STAMPS") {
      if (card.balance < program.stampsRequired) throw new AppError("INSUFFICIENT_BALANCE", `Недостаточно штампов: ${card.balance} из ${program.stampsRequired}.`);
      return { type: "REDEEM", amount: -program.stampsRequired, note: program.rewardText };
    }
    if (!i.rewardId) throw new AppError("VALIDATION", "Выберите награду.");
    const reward = (await tx.select().from(schema.rewards)
      .where(and(eq(schema.rewards.id, i.rewardId), eq(schema.rewards.programId, program.id), eq(schema.rewards.companyId, program.companyId), eq(schema.rewards.active, true))).limit(1))[0];
    if (!reward) throw new NotFoundError("Награда не найдена.");
    if (card.balance < reward.cost) throw new AppError("INSUFFICIENT_BALANCE", `Недостаточно баллов: ${card.balance} из ${reward.cost}.`);
    return { type: "REDEEM", amount: -reward.cost, note: reward.title };
  }, "card.redeem", "REDEEM");
}

// ───────────────────────── Business reads ─────────────────────────

function lim(n: unknown, d: number, max: number) {
  const v = Number(n);
  return Number.isInteger(v) && v > 0 ? Math.min(v, max) : d;
}
function off(n: unknown) {
  const v = Number(n);
  return Number.isInteger(v) && v >= 0 ? v : 0;
}

export async function listCustomers(companyId: string, o: { q?: string; limit: number; offset: number }) {
  const conds = [eq(schema.cards.companyId, companyId)];
  const q = o.q?.trim().slice(0, 100);
  if (q) {
    const pat = `%${q.replace(/[\\%_]/g, (m) => "\\" + m)}%`;
    conds.push(or(ilike(schema.users.name, pat), ilike(schema.users.email, pat))!);
  }
  const where = and(...conds);
  const base = () => db.select({
    cardId: schema.cards.id, customerName: schema.users.name, email: schema.users.email, programName: schema.programs.name, programType: schema.programs.type,
    balance: schema.cards.balance, lastActivityAt: schema.cards.lastActivityAt, createdAt: schema.cards.createdAt,
  }).from(schema.cards)
    .innerJoin(schema.users, eq(schema.users.id, schema.cards.customerId))
    .innerJoin(schema.programs, eq(schema.programs.id, schema.cards.programId));
  const [rows, totalR] = await Promise.all([
    base().where(where).orderBy(desc(schema.cards.lastActivityAt)).limit(lim(o.limit, 50, 200)).offset(off(o.offset)),
    db.select({ n: count() }).from(schema.cards).innerJoin(schema.users, eq(schema.users.id, schema.cards.customerId)).where(where),
  ]);
  const items = rows.map(({ email, ...r }) => ({ ...r, customerName: r.customerName ?? "", customerEmailMasked: maskEmail(email), customerEmail: maskEmail(email) }));
  return { items, total: Number(totalR[0]?.n ?? 0) };
}

export async function listTransactions(companyId: string, o: { cardId?: string; limit: number; offset: number }) {
  const conds = [eq(schema.transactions.companyId, companyId)];
  if (o.cardId) conds.push(eq(schema.transactions.cardId, o.cardId));
  const where = and(...conds);

  // Defense in depth: legacy or corrupted rows must not mix transaction,
  // card and program tenants. Use identical joins for items and total.
  const cardJoin = and(
    eq(schema.cards.id, schema.transactions.cardId),
    eq(schema.cards.companyId, schema.transactions.companyId),
  );
  const programJoin = and(
    eq(schema.programs.id, schema.cards.programId),
    eq(schema.programs.companyId, schema.cards.companyId),
  );

  const [items, totalR] = await Promise.all([
    db.select({
      id: schema.transactions.id, cardId: schema.transactions.cardId, type: schema.transactions.type, amount: schema.transactions.amount,
      purchaseMinor: schema.transactions.purchaseMinor, note: schema.transactions.note, staffUserId: schema.transactions.staffUserId, createdAt: schema.transactions.createdAt,
      programName: schema.programs.name,
    }).from(schema.transactions)
      .innerJoin(schema.cards, cardJoin)
      .innerJoin(schema.programs, programJoin)
      .where(where)
      .orderBy(desc(schema.transactions.createdAt), desc(schema.transactions.id))
      .limit(lim(o.limit, 50, 500)).offset(off(o.offset)),
    db.select({ n: count() })
      .from(schema.transactions)
      .innerJoin(schema.cards, cardJoin)
      .innerJoin(schema.programs, programJoin)
      .where(where),
  ]);
  return { items, total: Number(totalR[0]?.n ?? 0) };
}

export async function getCompanyAnalytics(companyId: string, days = 30) {
  const d = Math.min(Math.max(Math.floor(Number(days) || 30), 1), 365);
  const since = new Date(Date.now() - d * 86400_000);
  const activeSince = new Date(Date.now() - ACTIVE_CUSTOMER_DAYS * 86400_000);
  const [tot, act, ops, visits, news] = await Promise.all([
    db.select({ n: sql<number>`count(distinct ${schema.cards.customerId})` }).from(schema.cards).where(eq(schema.cards.companyId, companyId)),
    db.select({ n: sql<number>`count(distinct ${schema.cards.customerId})` }).from(schema.cards).where(and(eq(schema.cards.companyId, companyId), gt(schema.cards.lastActivityAt, activeSince))),
    db.select({ type: schema.transactions.type, n: count() }).from(schema.transactions)
      .where(and(eq(schema.transactions.companyId, companyId), gte(schema.transactions.createdAt, since))).groupBy(schema.transactions.type),
    db.execute(sql`SELECT to_char(g.day, 'YYYY-MM-DD') AS date, COALESCE(c.n, 0)::int AS count
      FROM generate_series((now() - make_interval(days => ${d - 1}::int))::date, now()::date, interval '1 day') AS g(day)
      LEFT JOIN (SELECT created_at::date AS day, count(*) AS n FROM transactions WHERE company_id = ${companyId} AND type = 'ACCRUE' AND created_at >= ${since} GROUP BY 1) c ON c.day = g.day::date
      ORDER BY g.day`),
    db.execute(sql`SELECT to_char(g.day, 'YYYY-MM-DD') AS date, COALESCE(c.n, 0)::int AS count
      FROM generate_series((now() - make_interval(days => ${d - 1}::int))::date, now()::date, interval '1 day') AS g(day)
      LEFT JOIN (SELECT created_at::date AS day, count(*) AS n FROM cards WHERE company_id = ${companyId} AND created_at >= ${since} GROUP BY 1) c ON c.day = g.day::date
      ORDER BY g.day`),
  ]);
  const byType = (t: string) => Number(ops.find((r) => r.type === t)?.n ?? 0);
  return {
    customersTotal: Number(tot[0]?.n ?? 0),
    activeCustomers: Number(act[0]?.n ?? 0),
    accruals: byType("ACCRUE"),
    redemptions: byType("REDEEM"),
    visitsByDay: (visits.rows as { date: string; count: number }[]).map((r) => ({ date: r.date, count: Number(r.count) })),
    newCustomersByDay: (news.rows as { date: string; count: number }[]).map((r) => ({ date: r.date, count: Number(r.count) })),
  };
}

/** CSV is generated entirely server-side after the caller's membership check.
 * Each export is tenant-filtered and refuses a silent partial download. */
export async function exportCompanyCsv(companyId: string, period?: string | null): Promise<string> {
  await assertFeature(companyId, "export");
  const window = parseExportPeriod(period);
  const rows = await db.select({
    cardId: schema.cards.id, name: schema.users.name, email: schema.users.email, program: schema.programs.name, type: schema.programs.type,
    balance: schema.cards.balance, createdAt: schema.cards.createdAt, lastActivityAt: schema.cards.lastActivityAt,
  }).from(schema.cards)
    .innerJoin(schema.users, eq(schema.users.id, schema.cards.customerId))
    .innerJoin(schema.programs, eq(schema.programs.id, schema.cards.programId))
        .where(and(
      eq(schema.cards.companyId, companyId),
      window ? gte(schema.cards.createdAt, window.from) : undefined,
      window ? lt(schema.cards.createdAt, window.until) : undefined,
    ))
    .orderBy(asc(schema.cards.createdAt), asc(schema.cards.id))
    .limit(MAX_EXPORT_ROWS + 1);

  assertCompleteExport(rows.length);
  const lines = [csvRow(["card_id", "name", "email", "program", "type", "balance", "created_at", "last_activity_at"])];
  for (const r of rows) {
    const deleted = r.email.endsWith("@deleted.invalid");
    lines.push(csvRow([r.cardId, deleted ? "" : r.name, deleted ? "" : r.email, r.program, r.type, r.balance, r.createdAt, r.lastActivityAt]));
  }
  await audit("company.export_csv", { companyId, meta: { kind: "cards", rows: rows.length, period: window?.label ?? null } });
  return "\uFEFF" + lines.join("\r\n") + "\r\n";
}

/** Signed loyalty transaction history: an independent CSV, not a card snapshot. */
export async function exportCompanyTransactionsCsv(companyId: string, period?: string | null): Promise<string> {
  await assertFeature(companyId, "export");
  const window = parseExportPeriod(period);
  const rows = await db.select({
    id: schema.transactions.id,
    cardId: schema.transactions.cardId,
    type: schema.transactions.type,
    amount: schema.transactions.amount,
    purchaseMinor: schema.transactions.purchaseMinor,
    staffUserId: schema.transactions.staffUserId,
    note: schema.transactions.note,
    createdAt: schema.transactions.createdAt,
  }).from(schema.transactions)
        .where(and(
      eq(schema.transactions.companyId, companyId),
      window ? gte(schema.transactions.createdAt, window.from) : undefined,
      window ? lt(schema.transactions.createdAt, window.until) : undefined,
    ))
    .orderBy(asc(schema.transactions.createdAt), asc(schema.transactions.id))
    .limit(MAX_EXPORT_ROWS + 1);

  assertCompleteExport(rows.length);
  const lines = [csvRow(["transaction_id", "card_id", "type", "amount", "purchase_minor", "staff_user_id", "note", "created_at"])];
  for (const r of rows) {
    lines.push(csvRow([r.id, r.cardId, r.type, r.amount, r.purchaseMinor, r.staffUserId, r.note, r.createdAt]));
  }
  await audit("company.export_csv", { companyId, meta: { kind: "transactions", rows: rows.length, period: window?.label ?? null } });
  return "\uFEFF" + lines.join("\r\n") + "\r\n";
}

export async function getCustomerCards(userId: string) {
  const rows = await db.select({ card: schema.cards, program: schema.programs, venue: schema.venues, companyName: schema.companies.name })
    .from(schema.cards)
    .innerJoin(schema.programs, and(
      eq(schema.programs.id, schema.cards.programId),
      eq(schema.programs.companyId, schema.cards.companyId),
    ))
    .innerJoin(schema.venues, and(
      eq(schema.venues.id, schema.programs.venueId),
      eq(schema.venues.companyId, schema.cards.companyId),
    ))
    .innerJoin(schema.companies, eq(schema.companies.id, schema.cards.companyId))
    .where(and(eq(schema.cards.customerId, userId), isNull(schema.companies.deletedAt)))
    .orderBy(desc(schema.cards.lastActivityAt));
  if (rows.length === 0) return [];
  const programIds = rows.map((r) => r.program.id);
  const cardIds = rows.map((r) => r.card.id);
  const [rws, txs] = await Promise.all([
    db.select().from(schema.rewards).where(and(inArray(schema.rewards.programId, programIds), eq(schema.rewards.active, true))).orderBy(asc(schema.rewards.cost)),
    db.execute(sql`SELECT id, card_id, type, amount, created_at FROM (
        SELECT t.id, t.card_id, t.type, t.amount, t.created_at,
               row_number() OVER (PARTITION BY t.card_id ORDER BY t.created_at DESC, t.id DESC) AS rn
        FROM transactions t
        JOIN cards c ON c.id = t.card_id
        WHERE t.card_id IN (${sql.join(cardIds.map((id) => sql`${id}`), sql`, `)})
          AND t.company_id = c.company_id
          AND c.customer_id = ${userId}
      ) x WHERE rn <= 20 ORDER BY created_at DESC, id DESC`),
  ]);
  const txRows = txs.rows as { id: string; card_id: string; type: string; amount: number; created_at: string | Date }[];
  return rows.map((r) => ({
    card: r.card,
    program: r.program,
    venue: { id: r.venue.id, name: r.venue.name, slug: r.venue.slug, address: r.venue.address, logoUrl: r.venue.logoUrl, brandColor: r.venue.brandColor },
    company: { name: r.companyName },
    rewards: rws.filter((x) => x.programId === r.program.id).map((x) => ({ id: x.id, title: x.title, cost: x.cost })),
    transactions: txRows.filter((t) => t.card_id === r.card.id).map((t) => ({ id: t.id, type: t.type, amount: Number(t.amount), createdAt: new Date(t.created_at) })),
  }));
}

export async function getCustomerByCardForCompany(companyId: string, cardId: string) {
  const r = (await db.select({
    cardId: schema.cards.id, balance: schema.cards.balance, lastActivityAt: schema.cards.lastActivityAt, createdAt: schema.cards.createdAt,
    name: schema.users.name, email: schema.users.email, program: schema.programs.name, programType: schema.programs.type, stampsRequired: schema.programs.stampsRequired,
  }).from(schema.cards)
    .innerJoin(schema.users, eq(schema.users.id, schema.cards.customerId))
    .innerJoin(schema.programs, eq(schema.programs.id, schema.cards.programId))
    .where(and(eq(schema.cards.id, cardId), eq(schema.cards.companyId, companyId))).limit(1))[0];
  if (!r) return null;
  return { ...r, id: r.cardId, name: r.name ?? "", email: maskEmail(r.email), emailMasked: maskEmail(r.email) };
}

// ───────────────────────── Referrals ─────────────────────────

export async function confirmReferral(referredCompanyId: string): Promise<{ status: "NONE" | "CONFIRMED" | "REWARDED"; changed: boolean }> {
  const res = await db.transaction(async (tx) => {
    const ref = (await tx.select().from(schema.referrals).where(eq(schema.referrals.referredCompanyId, referredCompanyId)).for("update").limit(1))[0];
    if (!ref) return { status: "NONE" as const, changed: false, ref: null };
    if (ref.status !== "PENDING") return { status: ref.status as "CONFIRMED" | "REWARDED", changed: false, ref };
    const referrer = (await tx.select().from(schema.companies).where(eq(schema.companies.id, ref.referrerCompanyId)).for("update").limit(1))[0];
    let status: "CONFIRMED" | "REWARDED" = "CONFIRMED";
    if (referrer && !referrer.deletedAt && referrer.plan !== "FREE" && referrer.planExpiresAt && referrer.planExpiresAt.getTime() > Date.now()) {
      await tx.update(schema.companies).set({ planExpiresAt: new Date(referrer.planExpiresAt.getTime() + 30 * 86400_000) }).where(eq(schema.companies.id, referrer.id));
      status = "REWARDED";
    }
    await tx.update(schema.referrals).set({ status, confirmedAt: new Date() }).where(eq(schema.referrals.id, ref.id));
    return { status, changed: true, ref };
  });
  if (res.changed && res.ref) await audit("referral.confirm", { companyId: res.ref.referrerCompanyId, meta: { referredCompanyId, status: res.status } });
  return { status: res.status, changed: res.changed };
}

// ───────────────────────── Platform admin ─────────────────────────

type CountryStats = {
  companies: number; venues: number; programs: number; cards: number; signups7d: number; signups30d: number; paidCompanies: number; paymentFailures30d: number;
  mrr: Partial<Record<"RUB" | "BYN", number>>;
};

export async function getPlatformStats() {
  const now = Date.now();
  const d7 = new Date(now - 7 * 86400_000);
  const d30 = new Date(now - 30 * 86400_000);
  const nowD = new Date(now);
  const [comps, venuesR, programsR, cardsR, failsR, funnelR, organicR, recentErrors] = await Promise.all([
    db.select({ country: schema.companies.country, plan: schema.companies.plan, planExpiresAt: schema.companies.planExpiresAt, createdAt: schema.companies.createdAt })
      .from(schema.companies).where(isNull(schema.companies.deletedAt)),
    db.select({ country: schema.companies.country, n: count() }).from(schema.venues).innerJoin(schema.companies, eq(schema.companies.id, schema.venues.companyId)).where(isNull(schema.companies.deletedAt)).groupBy(schema.companies.country),
    db.select({ country: schema.companies.country, n: count() }).from(schema.programs).innerJoin(schema.companies, eq(schema.companies.id, schema.programs.companyId)).where(isNull(schema.companies.deletedAt)).groupBy(schema.companies.country),
    db.select({ country: schema.companies.country, n: count() }).from(schema.cards).innerJoin(schema.companies, eq(schema.companies.id, schema.cards.companyId)).where(isNull(schema.companies.deletedAt)).groupBy(schema.companies.country),
    db.select({ country: schema.companies.country, n: count() }).from(schema.payments).innerJoin(schema.companies, eq(schema.companies.id, schema.payments.companyId))
      .where(and(eq(schema.payments.status, "FAILED"), gte(schema.payments.createdAt, d30))).groupBy(schema.companies.country),
    db.select({ type: schema.analyticsEvents.type, n: count() }).from(schema.analyticsEvents).where(gte(schema.analyticsEvents.createdAt, d30)).groupBy(schema.analyticsEvents.type),
    db.select({ n: count() }).from(schema.analyticsEvents).where(and(eq(schema.analyticsEvents.type, "page_view"), eq(schema.analyticsEvents.source, "organic"), gte(schema.analyticsEvents.createdAt, d30))),
    db.select().from(schema.auditLogs).where(like(schema.auditLogs.action, "error.%")).orderBy(desc(schema.auditLogs.createdAt)).limit(20),
  ]);
  void nowD;
  const pick = (rows: { country: string; n: number }[], c: CountryCode) => Number(rows.find((r) => r.country === c)?.n ?? 0);
  const block = (c: CountryCode): CountryStats => {
    const cs = comps.filter((x) => x.country === c);
    const paid = cs.filter((x) => effectivePlan(x) !== "FREE");
    const cur = COUNTRY[c].currency;
    const mrr = paid.reduce((s, x) => s + PLAN_PRICES[c][effectivePlan(x) as "PRO" | "TOP"], 0);
    return {
      companies: cs.length, venues: pick(venuesR, c), programs: pick(programsR, c), cards: pick(cardsR, c),
      signups7d: cs.filter((x) => x.createdAt >= d7).length, signups30d: cs.filter((x) => x.createdAt >= d30).length,
      paidCompanies: paid.length, paymentFailures30d: pick(failsR, c), mrr: { [cur]: mrr },
    };
  };
  const RU = block("RU");
  const BY = block("BY");
  const mrr = { RUB: RU.mrr.RUB ?? 0, BYN: BY.mrr.BYN ?? 0 }; // never summed across currencies
  const total = {
    companies: RU.companies + BY.companies, venues: RU.venues + BY.venues, programs: RU.programs + BY.programs, cards: RU.cards + BY.cards,
    signups7d: RU.signups7d + BY.signups7d, signups30d: RU.signups30d + BY.signups30d, paidCompanies: RU.paidCompanies + BY.paidCompanies,
    paymentFailures30d: RU.paymentFailures30d + BY.paymentFailures30d, mrr,
  };
  const f = (t: string) => Number(funnelR.find((r) => r.type === t)?.n ?? 0);
  const funnel = {
    page_view: f("page_view"), organic_visits: Number(organicR[0]?.n ?? 0), signup_business: f("signup_business"), first_card: f("first_card"),
    venue_activated: f("venue_activated"), paid: f("paid"), referral_click: f("referral_click"),
  };
  const rate = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 10000) / 100 : 0);
  const conversion = {
    visitToSignup: rate(funnel.signup_business, funnel.page_view),
    signupToFirstCard: rate(funnel.first_card, funnel.signup_business),
    firstCardToActivated: rate(funnel.venue_activated, funnel.first_card),
    signupToPaid: rate(funnel.paid, funnel.signup_business),
  };
  return { RU, BY, total, mrr, funnel, conversion, recentErrors };
}
