import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("next/headers", async () => (await import("./helpers")).nextHeadersMock);
vi.mock("next/navigation", async () => (await import("./helpers")).nextNavigationMock);
import { eq } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { deleteUserData, loginUser, registerUser } from "@/server/auth/service";
import { assertSameOrigin, createSession, destroySession, getCurrentUser, requirePlatformAdmin, requireUser, verifyCsrf, getCsrfToken } from "@/server/auth/session";
import { rateLimit } from "@/server/security/rateLimit";
import { ForbiddenError } from "@/server/errors";
import { audit } from "@/server/audit";
import { makeSetup, reqState, resetDb, setOrigin } from "./helpers";

beforeEach(resetDb);

const base = { password: "s3cret-pass", country: "RU" as const, acceptTerms: true, acceptPd: true };

describe("registration", () => {
  it("creates user with lowercase email and both consents (version 2026-11)", async () => {
    const u = await registerUser({ ...base, email: "  Ivan@Mail.RU ", name: "Иван" });
    expect(u.email).toBe("ivan@mail.ru");
    expect(u.passwordHash).not.toContain("s3cret");
    const cs = await db.select().from(schema.consents).where(eq(schema.consents.userId, u.id));
    expect(cs.map((c) => c.type).sort()).toEqual(["pd_processing", "terms"]);
    expect(cs.every((c) => c.version === "2026-11")).toBe(true);
    const logs = await db.select().from(schema.auditLogs).where(eq(schema.auditLogs.action, "user.register"));
    expect(logs).toHaveLength(1);
  });
  it("requires both consents", async () => {
    await expect(registerUser({ ...base, email: "a@b.ru", acceptPd: false })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(registerUser({ ...base, email: "a@b.ru", acceptTerms: false })).rejects.toMatchObject({ code: "VALIDATION" });
    expect(await db.select().from(schema.users)).toHaveLength(0);
  });
  it("rejects duplicate email (case-insensitive)", async () => {
    await registerUser({ ...base, email: "dup@x.ru" });
    await expect(registerUser({ ...base, email: "DUP@x.ru" })).rejects.toMatchObject({ code: "EMAIL_TAKEN" });
  });
});

describe("login & session", () => {
  it("logs in, creates hashed session, reads current user, destroys", async () => {
    const u = await registerUser({ ...base, email: "s@x.ru" });
    await expect(loginUser("s@x.ru", "wrong-pass")).rejects.toMatchObject({ code: "INVALID_CREDENTIALS", status: 401 });
    await expect(loginUser("nobody@x.ru", "whatever1")).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
    const logged = await loginUser("S@X.ru", "s3cret-pass");
    expect(logged.id).toBe(u.id);
    await createSession(logged.id);
    const token = reqState.cookies.get("bg_session")!;
    expect(token).toBeTruthy();
    const sess = await db.select().from(schema.sessions);
    expect(sess).toHaveLength(1);
    expect(sess[0].id).not.toBe(token);
    expect((await getCurrentUser())?.id).toBe(u.id);
    const csrf = await getCsrfToken();
    expect(await verifyCsrf(csrf)).toBe(true);
    expect(await verifyCsrf("nope")).toBe(false);
    await destroySession();
    expect(await getCurrentUser()).toBeNull();
    await expect(requireUser()).rejects.toThrow(/NEXT_REDIRECT:\/login/);
  });
  it("ignores expired sessions", async () => {
    const u = await registerUser({ ...base, email: "e@x.ru" });
    await createSession(u.id);
    await db.update(schema.sessions).set({ expiresAt: new Date(Date.now() - 1000) });
    expect(await getCurrentUser()).toBeNull();
  });
  it("rate-limits login by email (10 / 15 min)", async () => {
    await registerUser({ ...base, email: "rl@x.ru" });
    for (let i = 0; i < 10; i++) await expect(loginUser("rl@x.ru", "bad-password")).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
    await expect(loginUser("rl@x.ru", "s3cret-pass")).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });
  it("platform admin gate", async () => {
    await expect(requirePlatformAdmin()).rejects.toThrow(/NEXT_REDIRECT.*\/login\?next=%2Fadmin/);
    const u = await registerUser({ ...base, email: "boss@x.ru" });
    await createSession(u.id);
    await expect(requirePlatformAdmin()).rejects.toThrow(/NEXT_NOT_FOUND/);
    process.env.ADMIN_EMAILS = "other@x.ru, Boss@x.ru";
    expect((await requirePlatformAdmin()).id).toBe(u.id);
    delete process.env.ADMIN_EMAILS;
  });
});

describe("rate limiter", () => {
  it("allows `limit` hits per window then blocks with retryAfter", async () => {
    for (let i = 0; i < 3; i++) expect((await rateLimit("k1", 3, 60)).ok).toBe(true);
    const r = await rateLimit("k1", 3, 60);
    expect(r.ok).toBe(false);
    expect(r.retryAfter).toBeGreaterThan(0);
    expect(r.retryAfter).toBeLessThanOrEqual(60);
    expect((await rateLimit("k2", 3, 60)).ok).toBe(true);
  });
  it("is atomic under concurrency", async () => {
    const res = await Promise.all(Array.from({ length: 20 }, () => rateLimit("conc", 5, 60)));
    expect(res.filter((r) => r.ok)).toHaveLength(5);
  });
  it("resets after the window", async () => {
    await rateLimit("w", 1, 60);
    await db.update(schema.rateLimits).set({ windowStart: new Date(Date.now() - 61_000) });
    expect((await rateLimit("w", 1, 60)).ok).toBe(true);
  });
});

describe("same-origin check", () => {
  it("accepts same origin, rejects cross-site and missing origin", () => {
    expect(() => assertSameOrigin(setOrigin("https://qronus.ru", "qronus.ru"))).not.toThrow();
    expect(() => assertSameOrigin(setOrigin("https://evil.ru", "qronus.ru"))).toThrow(ForbiddenError);
    expect(() => assertSameOrigin(setOrigin(null, "qronus.ru"))).toThrow(ForbiddenError);
    const r = new Request("https://internal/x", { method: "POST", headers: { origin: "https://qronus.by", host: "internal:3000", "x-forwarded-host": "qronus.by" } });
    expect(() => assertSameOrigin(r)).not.toThrow();
  });
});

describe("deleteUserData", () => {
  it("anonymizes user, drops sessions & tokens, keeps transactions", async () => {
    const { company, program } = await makeSetup();
    const u = await registerUser({ ...base, email: "gone@x.ru", name: "Пётр" });
    await createSession(u.id);
    const [card] = await db.insert(schema.cards).values({ companyId: company.id, programId: program.id, customerId: u.id, balance: 1 }).returning();
    await db.insert(schema.transactions).values({ companyId: company.id, cardId: card.id, type: "ACCRUE", amount: 1, idempotencyKey: "keep-me-123" });
    await db.insert(schema.customerTokens).values({ userId: u.id, tokenHash: "h1", expiresAt: new Date(Date.now() + 60000) });
    await deleteUserData(u.id);
    const [after] = await db.select().from(schema.users).where(eq(schema.users.id, u.id));
    expect(after.email).toBe(`deleted-${u.id}@deleted.invalid`);
    expect(after.name).toBeNull();
    expect(after.phone).toBeNull();
    expect(after.deletedAt).not.toBeNull();
    expect(after.passwordHash).not.toBe(u.passwordHash);
    expect(await db.select().from(schema.sessions).where(eq(schema.sessions.userId, u.id))).toHaveLength(0);
    expect(await db.select().from(schema.customerTokens).where(eq(schema.customerTokens.userId, u.id))).toHaveLength(0);
    expect(await db.select().from(schema.transactions)).toHaveLength(1);
    await expect(loginUser("gone@x.ru", "s3cret-pass")).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
    expect(await getCurrentUser()).toBeNull();
  });
  it("audit never throws", async () => {
    await expect(audit("x".repeat(500), { meta: { a: 1 } })).resolves.toBeUndefined();
  });
});
