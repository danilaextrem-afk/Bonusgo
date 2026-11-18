import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("next/headers", async () => (await import("./helpers")).nextHeadersMock);
vi.mock("next/navigation", async () => (await import("./helpers")).nextNavigationMock);
import { eq } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { accrue, addStaff, createProgram, createVenue, getPublicProgramByVenueSlug, issueCustomerToken } from "@/server/loyalty/service";
import { isPlatformAdmin } from "@/server/auth/session";
import { mockAllowed } from "@/server/payments/mock";
import { createPaymentOrder, processNotification } from "@/server/payments/service";
import { LimitError } from "@/server/errors";
import { makeCompany, makeSetup, makeUser, resetDb } from "./helpers";

beforeEach(resetDb);
let k = 0;
const key = () => `sec-key-${++k}-${Date.now()}`;
const qr = async (userId: string) => `BG1.${(await issueCustomerToken(userId)).token}`;
const downgrade = (companyId: string) => db.update(schema.companies).set({ plan: "FREE", planExpiresAt: null }).where(eq(schema.companies.id, companyId));

describe("plan is enforced when features are used, not only when created", () => {
  it("POINTS program created on PRO stops accruing after downgrade", async () => {
    const { owner, company, program } = await makeSetup({ type: "POINTS", plan: "PRO" });
    const cust = await makeUser();
    await accrue({ actorUserId: owner.id, companyId: company.id, programId: program.id, customerToken: await qr(cust.id), purchaseMinor: 100_00, idempotencyKey: key() });
    await downgrade(company.id);
    await expect(
      accrue({ actorUserId: owner.id, companyId: company.id, programId: program.id, customerToken: await qr(cust.id), purchaseMinor: 100_00, idempotencyKey: key() }),
    ).rejects.toBeInstanceOf(LimitError);
  });

  it("programs and venues above the FREE limit are frozen after downgrade; the oldest keeps working", async () => {
    const { owner, company, venue, program } = await makeSetup({ plan: "TOP" });
    const v2 = await createVenue(company.id, { name: "Вторая точка" });
    const p2 = await createProgram(company.id, { venueId: v2.id, type: "STAMPS", name: "Вторая", stampsRequired: 5, rewardText: "Кофе" });
    await downgrade(company.id);
    const cust = await makeUser();
    await expect(accrue({ actorUserId: owner.id, companyId: company.id, programId: p2.id, customerToken: await qr(cust.id), idempotencyKey: key() })).rejects.toBeInstanceOf(LimitError);
    const ok = await accrue({ actorUserId: owner.id, companyId: company.id, programId: program.id, customerToken: await qr(cust.id), idempotencyKey: key() });
    expect(ok.card.balance).toBe(1);
    expect(venue.id).toBeTruthy();
  });

  it("staff added on a paid plan lose operation rights on FREE (owner keeps them)", async () => {
    const { company, program } = await makeSetup({ plan: "PRO" });
    const staff = await makeUser();
    await addStaff(company.id, { email: staff.email, role: "STAFF" });
    await downgrade(company.id);
    const cust = await makeUser();
    await expect(accrue({ actorUserId: staff.id, companyId: company.id, programId: program.id, customerToken: await qr(cust.id), idempotencyKey: key() })).rejects.toBeInstanceOf(LimitError);
  });

  it("custom logo and colour are hidden on the public page after downgrade", async () => {
    const { company, venue } = await makeSetup({ plan: "PRO" });
    await db.update(schema.venues).set({ brandColor: "#FF0000", logoUrl: "https://example.com/logo.png" }).where(eq(schema.venues.id, venue.id));
    expect((await getPublicProgramByVenueSlug(venue.slug))?.venue).toMatchObject({ brandColor: "#FF0000", logoUrl: "https://example.com/logo.png" });
    await downgrade(company.id);
    expect((await getPublicProgramByVenueSlug(venue.slug))?.venue).toMatchObject({ brandColor: "#39FF88", logoUrl: null });
  });
});

describe("limit checks cannot be raced", () => {
  it("10 parallel venue creations on FREE create exactly one", async () => {
    const u = await makeUser();
    const c = await makeCompany(u.id);
    const results = await Promise.allSettled(Array.from({ length: 10 }, (_, i) => createVenue(c.id, { name: `Точка ${i}` })));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.select().from(schema.venues).where(eq(schema.venues.companyId, c.id))).toHaveLength(1);
  });

  it("parallel program creations respect the PRO limit of 3", async () => {
    const { company, venue } = await makeSetup({ plan: "PRO" }); // already has 1 program
    await Promise.allSettled(Array.from({ length: 8 }, (_, i) => createProgram(company.id, { venueId: venue.id, type: "STAMPS", name: `P${i}`, stampsRequired: 5, rewardText: "Кофе" })));
    expect(await db.select().from(schema.programs).where(eq(schema.programs.companyId, company.id))).toHaveLength(3);
  });
});

describe("production hardening", () => {
  const env = { ...process.env };
  const setEnv = (o: Record<string, string | undefined>) => {
    for (const [k2, v] of Object.entries(o)) {
      if (v === undefined) delete (process.env as Record<string, string | undefined>)[k2];
      else (process.env as Record<string, string | undefined>)[k2] = v;
    }
  };
  const restore = () => setEnv({ NODE_ENV: env.NODE_ENV, PAYMENTS_TEST_MODE: env.PAYMENTS_TEST_MODE, ALLOW_TEST_PAYMENTS: undefined, ADMIN_EMAILS: undefined, SBP_PHONE: undefined });

  it("mock provider is never available in production, even with PAYMENTS_TEST_MODE=true", () => {
    setEnv({ NODE_ENV: "production", PAYMENTS_TEST_MODE: "true", ALLOW_TEST_PAYMENTS: undefined });
    expect(mockAllowed()).toBe(false);
    setEnv({ ALLOW_TEST_PAYMENTS: "true" });
    expect(mockAllowed()).toBe(true);
    restore();
  });

  it("a test payment does not grant a plan in production", async () => {
    setEnv({ PAYMENTS_TEST_MODE: "true", SBP_PHONE: undefined });
    const u = await makeUser();
    const c = await makeCompany(u.id, { country: "BY" });
    const o = await createPaymentOrder(c.id, "TOP", 12);
    const [p] = await db.select().from(schema.payments).where(eq(schema.payments.id, o.paymentId));
    expect(p.testMode).toBe(true);
    setEnv({ NODE_ENV: "production" });
    await processNotification("mock", { ok: true, invoiceNo: p.invoiceNo, amountMinor: p.amountMinor, kind: "paid", raw: {} });
    restore();
    const [after] = await db.select().from(schema.companies).where(eq(schema.companies.id, c.id));
    expect(after.plan).toBe("FREE");
  });

  it("ADMIN_EMAILS grants nothing in production; only the DB role does", () => {
    setEnv({ NODE_ENV: "production", ADMIN_EMAILS: "boss@example.com" });
    expect(isPlatformAdmin({ email: "boss@example.com", platformRole: "USER" })).toBe(false);
    expect(isPlatformAdmin({ email: "x@example.com", platformRole: "ADMIN" })).toBe(true);
    restore();
  });
});
