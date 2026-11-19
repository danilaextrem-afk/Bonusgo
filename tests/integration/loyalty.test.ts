import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("next/headers", async () => (await import("./helpers")).nextHeadersMock);
vi.mock("next/navigation", async () => (await import("./helpers")).nextNavigationMock);
import { eq } from "drizzle-orm";
import { db, schema } from "@/server/db";
import {
  accrue, addStaff, confirmReferral, createCompany, createProgram, createReward, createVenue, exportCompanyCsv, getCompanyAnalytics, getCustomerCards,
  getPlatformStats, getPublicProgramByVenueSlug, issueCustomerToken, joinProgram, listCustomers, listTransactions, redeem,
} from "@/server/loyalty/service";
import { effectivePlan, getUsage, assertFeature } from "@/server/limits";
import { auditCompanyLedger } from "@/server/loyalty/ledger-audit";
import { getUserCompanies, requireMembership } from "@/server/tenancy";
import { createSession } from "@/server/auth/session";
import { ForbiddenError, LimitError } from "@/server/errors";
import { makeCompany, makeSetup, makeUser, resetDb } from "./helpers";

beforeEach(resetDb);
let k = 0;
const key = () => `idem-key-${++k}-${Date.now()}`;
const qr = async (userId: string) => `BG1.${(await issueCustomerToken(userId)).token}`;

describe("company setup", () => {
  it("createCompany adds OWNER, referral row and signup event", async () => {
    const a = await makeUser();
    const ref = await makeCompany(a.id, { plan: "PRO" });
    const b = await makeUser();
    const c = await createCompany(b.id, { name: "Пекарня", country: "BY", referralCode: ref.referralCode });
    expect(c.currency).toBe("BYN");
    const companies = await getUserCompanies(b.id);
    expect(companies).toHaveLength(1);
    expect(companies[0].role).toBe("OWNER");
    expect(await db.select().from(schema.referrals)).toHaveLength(1);
    const ev = await db.select().from(schema.analyticsEvents).where(eq(schema.analyticsEvents.type, "signup_business"));
    expect(ev).toHaveLength(1);
    // self-referral ignored
    const c2 = await createCompany(a.id, { name: "Ещё", country: "RU", referralCode: ref.referralCode });
    expect(c2.referredById).toBeNull();
  });

  it("venue slug transliterated, branding validated, FREE limits enforced", async () => {
    const u = await makeUser();
    const c = await makeCompany(u.id);
    await expect(createVenue(c.id, { name: "X", brandColor: "red" })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(createVenue(c.id, { name: "X", logoUrl: "javascript:alert(1)" })).rejects.toMatchObject({ code: "VALIDATION" });
    const v = await createVenue(c.id, { name: "Кофейня Утро" });
    expect(v.slug).toMatch(/^kofeynya-utro-[0-9a-f]{6}$/);
    await expect(createVenue(c.id, { name: "Вторая" })).rejects.toBeInstanceOf(LimitError);
    await expect(createProgram(c.id, { venueId: v.id, type: "POINTS", name: "Баллы", rewardText: "" })).rejects.toMatchObject({ code: "PLAN_LIMIT", status: 402 });
    await expect(createProgram(c.id, { venueId: v.id, type: "STAMPS", name: "S", stampsRequired: 2, rewardText: "Кофе" })).rejects.toMatchObject({ code: "VALIDATION" });
    const p = await createProgram(c.id, { venueId: v.id, type: "STAMPS", name: "Штампы", stampsRequired: 6, rewardText: "Кофе" });
    expect(p).toBeTruthy();
    expect(await db.select().from(schema.analyticsEvents).where(eq(schema.analyticsEvents.type, "first_card"))).toHaveLength(1);
    await expect(createProgram(c.id, { venueId: v.id, type: "STAMPS", name: "Ещё", rewardText: "Кофе" })).rejects.toBeInstanceOf(LimitError);
    await expect(createReward(c.id, { programId: (p as { id: string }).id, title: "x", cost: 5 })).rejects.toBeInstanceOf(LimitError);
    const staff = await makeUser();
    await expect(addStaff(c.id, { email: staff.email, role: "STAFF" })).rejects.toBeInstanceOf(LimitError);
    const usage = await getUsage(c.id);
    expect(usage).toMatchObject({ venues: 1, programs: 1, staff: 0, plan: "FREE" });
    const pub = await getPublicProgramByVenueSlug(v.slug);
    expect(pub?.company.plan).toBe("FREE");
    expect(pub?.programs).toHaveLength(1);
    expect(await getPublicProgramByVenueSlug("nope")).toBeNull();
  });

  it("expired paid plan behaves as FREE", async () => {
    const u = await makeUser();
    const c = await makeCompany(u.id, { plan: "TOP", planExpiresAt: new Date(Date.now() - 1000) });
    expect(effectivePlan(c)).toBe("FREE");
    await expect(assertFeature(c.id, "export")).rejects.toBeInstanceOf(LimitError);
    await createVenue(c.id, { name: "Одна" });
    await expect(createVenue(c.id, { name: "Две" })).rejects.toBeInstanceOf(LimitError);
    const active = await makeCompany(u.id, { plan: "TOP", planExpiresAt: new Date(Date.now() + 86400_000) });
    expect(effectivePlan(active)).toBe("TOP");
  });
});

describe("tenancy isolation", () => {
  it("users cannot touch other tenants", async () => {
    const a = await makeSetup();
    const b = await makeSetup();
    await createSession(a.owner.id);
    await expect(requireMembership(b.company.id)).rejects.toBeInstanceOf(ForbiddenError);
    expect((await requireMembership(a.company.id, ["OWNER"])).company.id).toBe(a.company.id);
    await expect(requireMembership(a.company.id, ["STAFF"])).rejects.toBeInstanceOf(ForbiddenError);
    const cust = await makeUser();
    // A's owner cannot accrue on B's program, nor with A's company id + B's program
    await expect(accrue({ actorUserId: a.owner.id, companyId: b.company.id, programId: b.program.id, customerToken: await qr(cust.id), idempotencyKey: key() })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(accrue({ actorUserId: a.owner.id, companyId: a.company.id, programId: b.program.id, customerToken: await qr(cust.id), idempotencyKey: key() })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(createProgram(a.company.id, { venueId: b.venue.id, type: "STAMPS", name: "x", rewardText: "y" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    // B's customers are invisible to A
    await joinProgram(cust.id, b.program.id);
    expect((await listCustomers(a.company.id, { limit: 50, offset: 0 })).total).toBe(0);
    expect((await listCustomers(b.company.id, { limit: 50, offset: 0 })).total).toBe(1);
    // idempotency key reuse across tenants is forbidden
    const shared = key();
    const bOk = await accrue({ actorUserId: b.owner.id, companyId: b.company.id, programId: b.program.id, customerToken: await qr(cust.id), idempotencyKey: shared });
    expect(bOk.duplicated).toBe(false);
    await expect(accrue({ actorUserId: a.owner.id, companyId: a.company.id, programId: a.program.id, customerToken: await qr(cust.id), idempotencyKey: shared })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("STAFF restricted to own venue", async () => {
    const s = await makeSetup({ plan: "TOP" });
    const [v2] = await db.insert(schema.venues).values({ companyId: s.company.id, name: "B", slug: `b-${Date.now()}` }).returning();
    const [p2] = await db.insert(schema.programs).values({ companyId: s.company.id, venueId: v2.id, type: "STAMPS", name: "P2" }).returning();
    const staff = await makeUser();
    await addStaff(s.company.id, { email: staff.email, role: "STAFF", venueId: s.venue.id });
    const cust = await makeUser();
    await expect(accrue({ actorUserId: staff.id, companyId: s.company.id, programId: p2.id, customerToken: await qr(cust.id), idempotencyKey: key() })).rejects.toBeInstanceOf(ForbiddenError);
    const ok = await accrue({ actorUserId: staff.id, companyId: s.company.id, programId: s.program.id, customerToken: await qr(cust.id), idempotencyKey: key() });
    expect(ok.card.balance).toBe(1);
  });
});

describe("operations", () => {
  it("one-time token cannot be reused; accepts bare token too", async () => {
    const s = await makeSetup();
    const cust = await makeUser();
    const t = await qr(cust.id);
    await accrue({ actorUserId: s.owner.id, companyId: s.company.id, programId: s.program.id, customerToken: t, idempotencyKey: key() });
    await expect(accrue({ actorUserId: s.owner.id, companyId: s.company.id, programId: s.program.id, customerToken: t, idempotencyKey: key() })).rejects.toMatchObject({ code: "INVALID_TOKEN" });
    const bare = (await issueCustomerToken(cust.id)).token;
    const r = await accrue({ actorUserId: s.owner.id, companyId: s.company.id, programId: s.program.id, customerToken: bare, stamps: 3, idempotencyKey: key() });
    expect(r.card.balance).toBe(4);
    await expect(accrue({ actorUserId: s.owner.id, companyId: s.company.id, programId: s.program.id, customerToken: await qr(cust.id), stamps: 6, idempotencyKey: key() })).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("expired token is rejected", async () => {
    const s = await makeSetup();
    const cust = await makeUser();
    const t = await qr(cust.id);
    await db.update(schema.customerTokens).set({ expiresAt: new Date(Date.now() - 1000) });
    await expect(accrue({ actorUserId: s.owner.id, companyId: s.company.id, programId: s.program.id, customerToken: t, idempotencyKey: key() })).rejects.toMatchObject({ code: "INVALID_TOKEN" });
  });

  it("idempotent retry returns duplicated=true without double accrual", async () => {
    const s = await makeSetup();
    const cust = await makeUser();
    const k1 = key();
    const token = await qr(cust.id);
    const first = await accrue({ actorUserId: s.owner.id, companyId: s.company.id, programId: s.program.id, customerToken: token, idempotencyKey: k1 });
    const again = await accrue({ actorUserId: s.owner.id, companyId: s.company.id, programId: s.program.id, customerToken: token, idempotencyKey: k1 });
    expect(first.duplicated).toBe(false);
    expect(again.duplicated).toBe(true);
    expect(again.transaction.id).toBe(first.transaction.id);
    expect(again.card.balance).toBe(1);
    expect(await db.select().from(schema.transactions)).toHaveLength(1);
  });

  it("refuses to replay an idempotency key for another action, program or staff member", async () => {
    const s = await makeSetup({ plan: "TOP", stampsRequired: 3 });
    const cust = await makeUser();
    const sameKey = key();
    const base = { actorUserId: s.owner.id, companyId: s.company.id, programId: s.program.id };
    const originalToken = await qr(cust.id);
    const first = await accrue({ ...base, customerToken: originalToken, stamps: 3, idempotencyKey: sameKey });

    await expect(redeem({ ...base, customerToken: await qr(cust.id), idempotencyKey: sameKey }))
      .rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT", status: 409 });

    const extra = await createProgram(s.company.id, {
      venueId: s.venue.id, type: "STAMPS", name: "Вторая программа", rewardText: "Кофе",
    });
    await expect(accrue({ ...base, programId: extra.id, customerToken: await qr(cust.id), idempotencyKey: sameKey }))
      .rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT", status: 409 });

    const otherStaff = await makeUser();
    await addStaff(s.company.id, { email: otherStaff.email, role: "MANAGER" });
    await expect(accrue({ ...base, actorUserId: otherStaff.id, customerToken: await qr(cust.id), idempotencyKey: sameKey }))
      .rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT", status: 409 });

    // A genuine retry of the same actor/action/program remains idempotent.
    const replay = await accrue({ ...base, customerToken: originalToken, stamps: 3, idempotencyKey: sameKey });
    expect(replay.duplicated).toBe(true);
    expect(replay.transaction.id).toBe(first.transaction.id);
    expect(replay.card.balance).toBe(3);
    expect(await db.select().from(schema.transactions)).toHaveLength(1);
  });

  it("rejects cross-customer and forged-QR retries with the same staff, program and idempotency key", async () => {
    const setup = await makeSetup({ plan: "TOP" });
    const alice = await makeUser();
    const bob = await makeUser();
    const base = {
      actorUserId: setup.owner.id,
      companyId: setup.company.id,
      programId: setup.program.id,
      idempotencyKey: key(),
    };
    const aliceQr = await qr(alice.id);
    const first = await accrue({ ...base, customerToken: aliceQr, stamps: 2 });
    const bobQr = await qr(bob.id);

    // Prior code would return Alice's balance and transaction to the request
    // carrying Bob's QR code, without checking QR ownership.
    await expect(accrue({ ...base, customerToken: bobQr, stamps: 2 }))
      .rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT", status: 409 });
    await expect(accrue({ ...base, customerToken: "BG1.fake-token-with-no-owner", stamps: 2 }))
      .rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT", status: 409 });

    const retry = await accrue({ ...base, customerToken: aliceQr, stamps: 2 });
    expect(retry.duplicated).toBe(true);
    expect(retry.transaction.id).toBe(first.transaction.id);

    // Another legitimate QR for Alice is acceptable, but is not consumed.
    const freshAliceQr = await qr(alice.id);
    const retryWithNewQr = await accrue({ ...base, customerToken: freshAliceQr, stamps: 2 });
    expect(retryWithNewQr.duplicated).toBe(true);
    expect(retryWithNewQr.transaction.id).toBe(first.transaction.id);
    expect(await db.select().from(schema.transactions)).toHaveLength(1);
    const cards = await db.select().from(schema.cards);
    expect(cards).toHaveLength(1);
    expect(cards[0].customerId).toBe(alice.id);
    expect(cards[0].balance).toBe(2);
  });

  it("two simultaneous scans of one QR token permit only one accrual", async () => {
    const s = await makeSetup();
    const cust = await makeUser();
    const base = { actorUserId: s.owner.id, companyId: s.company.id, programId: s.program.id };
    const customerToken = await qr(cust.id);
    const results = await Promise.allSettled([
      accrue({ ...base, customerToken, idempotencyKey: key() }),
      accrue({ ...base, customerToken, idempotencyKey: key() }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatchObject({ code: "INVALID_TOKEN" });
    const [card] = await db.select().from(schema.cards).where(eq(schema.cards.customerId, cust.id));
    expect(card.balance).toBe(1);
    expect(await db.select().from(schema.transactions)).toHaveLength(1);
  });

  it("concurrent retries with one idempotency key write one transaction", async () => {
    const s = await makeSetup();
    const cust = await makeUser();
    const base = { actorUserId: s.owner.id, companyId: s.company.id, programId: s.program.id };
    const sameKey = key();
    const tokens = await Promise.all([qr(cust.id), qr(cust.id)]);
    const res = await Promise.all(tokens.map((customerToken) => accrue({
      ...base, customerToken, idempotencyKey: sameKey,
    })));
    expect(res.filter((r) => !r.duplicated)).toHaveLength(1);
    expect(res.filter((r) => r.duplicated)).toHaveLength(1);
    expect(res[0].transaction.id).toBe(res[1].transaction.id);
    const [card] = await db.select().from(schema.cards).where(eq(schema.cards.customerId, cust.id));
    expect(card.balance).toBe(1);
    expect(await db.select().from(schema.transactions)).toHaveLength(1);
  });

  it("two concurrent redemptions cannot overdraw a stamp balance", async () => {
    const s = await makeSetup({ stampsRequired: 3 });
    const cust = await makeUser();
    const base = { actorUserId: s.owner.id, companyId: s.company.id, programId: s.program.id };
    await accrue({ ...base, customerToken: await qr(cust.id), stamps: 3, idempotencyKey: key() });
    const tokens = await Promise.all([qr(cust.id), qr(cust.id)]);
    const attempts = await Promise.allSettled(tokens.map((customerToken) =>
      redeem({ ...base, customerToken, idempotencyKey: key() }),
    ));
    expect(attempts.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const failures = attempts.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(failures).toHaveLength(1);
    expect(failures[0].reason).toMatchObject({ code: "INSUFFICIENT_BALANCE" });
    const [card] = await db.select().from(schema.cards).where(eq(schema.cards.customerId, cust.id));
    expect(card.balance).toBe(0);
    expect(await db.select().from(schema.transactions)).toHaveLength(2);
  });

  it("10 concurrent accruals → balance 10", async () => {
    const s = await makeSetup();
    const cust = await makeUser();
    await joinProgram(cust.id, s.program.id);
    const tokens = await Promise.all(Array.from({ length: 10 }, () => qr(cust.id)));
    const res = await Promise.all(tokens.map((t) => accrue({ actorUserId: s.owner.id, companyId: s.company.id, programId: s.program.id, customerToken: t, idempotencyKey: key() })));
    expect(res.every((r) => !r.duplicated)).toBe(true);
    const [card] = await db.select().from(schema.cards).where(eq(schema.cards.customerId, cust.id));
    expect(card.balance).toBe(10);
    expect(await db.select().from(schema.transactions)).toHaveLength(10);
  });

  it("concurrent first accruals without a card create exactly one card", async () => {
    const s = await makeSetup();
    const cust = await makeUser();
    const tokens = await Promise.all(Array.from({ length: 5 }, () => qr(cust.id)));
    await Promise.all(tokens.map((t) => accrue({ actorUserId: s.owner.id, companyId: s.company.id, programId: s.program.id, customerToken: t, idempotencyKey: key() })));
    const cards = await db.select().from(schema.cards);
    expect(cards).toHaveLength(1);
    expect(cards[0].balance).toBe(5);
    expect(await db.select().from(schema.analyticsEvents).where(eq(schema.analyticsEvents.type, "venue_activated"))).toHaveLength(1);
  });

  it("stamps redeem: insufficient then success", async () => {
    const s = await makeSetup({ stampsRequired: 3 });
    const cust = await makeUser();
    const op = { actorUserId: s.owner.id, companyId: s.company.id, programId: s.program.id };
    await accrue({ ...op, customerToken: await qr(cust.id), stamps: 2, idempotencyKey: key() });
    await expect(redeem({ ...op, customerToken: await qr(cust.id), idempotencyKey: key() })).rejects.toMatchObject({ code: "INSUFFICIENT_BALANCE" });
    await accrue({ ...op, customerToken: await qr(cust.id), stamps: 2, idempotencyKey: key() });
    const r = await redeem({ ...op, customerToken: await qr(cust.id), idempotencyKey: key() });
    expect(r.card.balance).toBe(1);
    expect(r.transaction.amount).toBe(-3);
  });

  it("points accrual & reward redeem", async () => {
    const s = await makeSetup({ type: "POINTS", plan: "PRO", pointsPercent: 10 });
    const cust = await makeUser();
    const op = { actorUserId: s.owner.id, companyId: s.company.id, programId: s.program.id };
    const reward = (await createReward(s.company.id, { programId: s.program.id, title: "Капучино", cost: 50 })) as { id: string };
    await expect(accrue({ ...op, customerToken: await qr(cust.id), idempotencyKey: key() })).rejects.toMatchObject({ code: "VALIDATION" });
    const a = await accrue({ ...op, customerToken: await qr(cust.id), purchaseMinor: 450_00, idempotencyKey: key() });
    expect(a.card.balance).toBe(45);
    await expect(redeem({ ...op, customerToken: await qr(cust.id), rewardId: reward.id, idempotencyKey: key() })).rejects.toMatchObject({ code: "INSUFFICIENT_BALANCE" });
    await accrue({ ...op, customerToken: await qr(cust.id), purchaseMinor: 100_00, idempotencyKey: key() });
    const r = await redeem({ ...op, customerToken: await qr(cust.id), rewardId: reward.id, idempotencyKey: key() });
    expect(r.card.balance).toBe(5);
    const cards = await getCustomerCards(cust.id);
    expect(cards[0].transactions).toHaveLength(3);
    expect(cards[0].rewards).toHaveLength(1);
    const tx = await listTransactions(s.company.id, { cardId: r.card.id, limit: 10, offset: 0 });
    expect(tx.total).toBe(3);
    const an = await getCompanyAnalytics(s.company.id, 30);
    expect(an).toMatchObject({ customersTotal: 1, activeCustomers: 1, accruals: 2, redemptions: 1 });
    expect(an.visitsByDay).toHaveLength(30);
    expect(an.visitsByDay.at(-1)?.count).toBe(2);
  });

  it("FREE plan: 101st active customer is blocked, inactive customers don't count", async () => {
    const s = await makeSetup();
    const users = await db.insert(schema.users).values(Array.from({ length: 101 }, (_, i) => ({ email: `bulk${i}@t.ru`, passwordHash: "x" }))).returning();
    await db.insert(schema.cards).values(users.slice(0, 100).map((u) => ({ companyId: s.company.id, programId: s.program.id, customerId: u.id })));
    await expect(joinProgram(users[100].id, s.program.id)).rejects.toMatchObject({ code: "PLAN_LIMIT" });
    await expect(accrue({ actorUserId: s.owner.id, companyId: s.company.id, programId: s.program.id, customerToken: await qr(users[100].id), idempotencyKey: key() })).rejects.toBeInstanceOf(LimitError);
    // existing customers keep working
    const ok = await joinProgram(users[0].id, s.program.id);
    expect(ok.customerId).toBe(users[0].id);
    // make one inactive → slot frees up
    await db.update(schema.cards).set({ lastActivityAt: new Date(Date.now() - 100 * 86400_000) }).where(eq(schema.cards.customerId, users[1].id));
    const joined = await joinProgram(users[100].id, s.program.id);
    expect(joined.customerId).toBe(users[100].id);
  });

  it("customer list masks email; CSV export needs TOP and neutralizes injection", async () => {
    const s = await makeSetup({ plan: "TOP" });
    const cust = await makeUser({ email: "evil@x.ru", name: "=HYPERLINK(\"http://x\")" });
    await joinProgram(cust.id, s.program.id);
    const list = await listCustomers(s.company.id, { q: "evil", limit: 10, offset: 0 });
    expect(list.items[0].customerEmailMasked).toBe("ev***@x.ru");
    const csv = await exportCompanyCsv(s.company.id);
    expect(csv).toContain(`"'=HYPERLINK(""http://x"")"`);
    const free = await makeSetup();
    await expect(exportCompanyCsv(free.company.id)).rejects.toBeInstanceOf(LimitError);
  });

  it("customer QR issuance is rate-limited (20/hour)", async () => {
    const cust = await makeUser();
    for (let i = 0; i < 20; i++) await issueCustomerToken(cust.id);
    await expect(issueCustomerToken(cust.id)).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("staff operations are rate-limited (60/min)", async () => {
    const s = await makeSetup();
    await db.insert(schema.rateLimits).values({ key: `staff-op:${s.owner.id}`, windowStart: new Date(), count: 60 });
    const cust = await makeUser();
    await expect(accrue({ actorUserId: s.owner.id, companyId: s.company.id, programId: s.program.id, customerToken: await qr(cust.id), idempotencyKey: key() })).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });
});

describe("referrals & platform stats", () => {
  it("confirmReferral is idempotent and extends paid referrer by 30 days", async () => {
    const a = await makeUser();
    const exp = new Date(Date.now() + 10 * 86400_000);
    const referrer = await makeCompany(a.id, { plan: "PRO", planExpiresAt: exp });
    const b = await makeUser();
    const referred = await createCompany(b.id, { name: "Новая", country: "RU", referralCode: referrer.referralCode });
    const r1 = await confirmReferral(referred.id);
    const r2 = await confirmReferral(referred.id);
    expect(r1).toEqual({ status: "REWARDED", changed: true });
    expect(r2.changed).toBe(false);
    const [after] = await db.select().from(schema.companies).where(eq(schema.companies.id, referrer.id));
    expect(after.planExpiresAt!.getTime() - exp.getTime()).toBe(30 * 86400_000);
    // FREE referrer → CONFIRMED only
    const c = await makeUser();
    const freeRef = await makeCompany(c.id);
    const d = await makeUser();
    const r3 = await createCompany(d.id, { name: "Ещё", country: "RU", referralCode: freeRef.referralCode });
    expect((await confirmReferral(r3.id)).status).toBe("CONFIRMED");
    expect((await confirmReferral("no-such")).status).toBe("NONE");
  });

  it("MRR is computed per currency and never summed", async () => {
    const u = await makeUser();
    const future = new Date(Date.now() + 86400_000);
    await makeCompany(u.id, { country: "RU", plan: "PRO", planExpiresAt: future });
    await makeCompany(u.id, { country: "RU", plan: "TOP", planExpiresAt: future });
    await makeCompany(u.id, { country: "RU", plan: "TOP", planExpiresAt: new Date(Date.now() - 1000) }); // expired
    await makeCompany(u.id, { country: "BY", plan: "PRO", planExpiresAt: future });
    await makeCompany(u.id, { country: "BY" });
    const st = await getPlatformStats();
    expect(st.mrr).toEqual({ RUB: 490_00 + 990_00, BYN: 35_00 });
    expect(st.RU.mrr).toEqual({ RUB: 490_00 + 990_00 });
    expect(st.BY.mrr).toEqual({ BYN: 35_00 });
    expect(st.RU.paidCompanies).toBe(2);
    expect(st.total.companies).toBe(5);
    expect(st.funnel).toHaveProperty("organic_visits");
  });
});

describe("read-only ledger reconciliation", () => {
  it("matches normal operations, detects balance corruption, and never repairs automatically", async () => {
    const setup = await makeSetup({ stampsRequired: 3 });
    const customer = await makeUser();
    const op = { actorUserId: setup.owner.id, companyId: setup.company.id, programId: setup.program.id };
    expect(await auditCompanyLedger(setup.company.id)).toEqual({
      companyId: setup.company.id, cardsChecked: 0, discrepancies: [],
    });

    await accrue({ ...op, customerToken: await qr(customer.id), stamps: 4, idempotencyKey: key() });
    await redeem({ ...op, customerToken: await qr(customer.id), idempotencyKey: key() });
    expect(await auditCompanyLedger(setup.company.id)).toEqual({
      companyId: setup.company.id, cardsChecked: 1, discrepancies: [],
    });

    const [card] = await db.select().from(schema.cards).where(eq(schema.cards.customerId, customer.id));
    await db.update(schema.cards).set({ balance: 9 }).where(eq(schema.cards.id, card.id));
    const report = await auditCompanyLedger(setup.company.id);
    expect(report).toEqual({
      companyId: setup.company.id,
      cardsChecked: 1,
      discrepancies: [{ cardId: card.id, storedBalance: 9, ledgerBalance: 1, foreignTenantTransactions: 0 }],
    });
    const [unchanged] = await db.select().from(schema.cards).where(eq(schema.cards.id, card.id));
    expect(unchanged.balance).toBe(9); // Audit is intentionally read-only.
  });

  it("flags a transaction attributed to the wrong tenant even if balances match", async () => {
    const a = await makeSetup();
    const b = await makeSetup();
    const customer = await makeUser();
    await accrue({
      actorUserId: a.owner.id, companyId: a.company.id, programId: a.program.id,
      customerToken: await qr(customer.id), idempotencyKey: key(),
    });
    const [transaction] = await db.select().from(schema.transactions);
    await db.update(schema.transactions)
      .set({ companyId: b.company.id })
      .where(eq(schema.transactions.id, transaction.id));

    const report = await auditCompanyLedger(a.company.id);
    expect(report.discrepancies).toHaveLength(1);
    expect(report.discrepancies[0]).toMatchObject({
      storedBalance: 1, ledgerBalance: 1, foreignTenantTransactions: 1,
    });
    expect((await auditCompanyLedger(b.company.id)).cardsChecked).toBe(0);
  });
});

describe("customer history across several bonus cards", () => {
  it("isolates other customers and returns the newest 20 transactions per card", async () => {
    const first = await makeSetup({ plan: "TOP" });
    const second = await makeSetup({ plan: "TOP" });
    const customer = await makeUser();
    const stranger = await makeUser();

    const cardA = await joinProgram(customer.id, first.program.id);
    const cardB = await joinProgram(customer.id, second.program.id);
    const strangerCard = await joinProgram(stranger.id, second.program.id);

    const entries = [
      ...Array.from({ length: 25 }, (_, i) => ({
        companyId: first.company.id,
        cardId: cardA.id,
        type: "ACCRUE" as const,
        amount: i + 1,
        idempotencyKey: `multi-card-a-${i}`,
        createdAt: new Date(Date.UTC(2026, 0, 1, 0, i)),
      })),
      ...Array.from({ length: 25 }, (_, i) => ({
        companyId: second.company.id,
        cardId: cardB.id,
        type: "REDEEM" as const,
        amount: -(i + 1),
        idempotencyKey: `multi-card-b-${i}`,
        createdAt: new Date(Date.UTC(2026, 0, 1, 0, i)),
      })),
      {
        companyId: second.company.id,
        cardId: strangerCard.id,
        type: "ACCRUE" as const,
        amount: 777,
        idempotencyKey: "multi-card-outsider",
        createdAt: new Date(Date.UTC(2026, 0, 1, 1, 0)),
      },
    ];
    await db.insert(schema.transactions).values(entries);

    const cards = await getCustomerCards(customer.id);
    expect(cards).toHaveLength(2);
    const a = cards.find((item) => item.card.id === cardA.id);
    const b = cards.find((item) => item.card.id === cardB.id);
    expect(a?.transactions.map((tx) => tx.amount)).toEqual(
      Array.from({ length: 20 }, (_, i) => 25 - i),
    );
    expect(b?.transactions.map((tx) => tx.amount)).toEqual(
      Array.from({ length: 20 }, (_, i) => -(25 - i)),
    );
    expect(a?.transactions.every((tx) => tx.type === "ACCRUE")).toBe(true);
    expect(b?.transactions.every((tx) => tx.type === "REDEEM")).toBe(true);
    expect(cards.flatMap((item) => item.transactions).some((tx) => tx.amount === 777)).toBe(false);
    expect(await getCustomerCards(stranger.id)).toHaveLength(1);
    expect((await getCustomerCards(stranger.id))[0].transactions.map((tx) => tx.amount)).toEqual([777]);
    expect(await getCustomerCards((await makeUser()).id)).toEqual([]);
  });
});
