import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("next/headers", async () => (await import("./helpers")).nextHeadersMock);
vi.mock("next/navigation", async () => (await import("./helpers")).nextNavigationMock);
import { closeYdb, ydb } from "@/server/ydb/client";
import { createId } from "@/server/id";
import { nowSec } from "@/server/ydb/values";
import { deleteUserData, loginUser, registerUser } from "@/server/auth/service";
import { assertSameOrigin, createSession, destroySession, getCurrentUser, requirePlatformAdmin, requireUser, verifyCsrf, getCsrfToken } from "@/server/auth/session";
import { rateLimit } from "@/server/security/rateLimit";
import { ForbiddenError } from "@/server/errors";
import { audit } from "@/server/audit";
import { trackEvent } from "@/server/loyalty/analytics";
import { makeSetup, reqState, resetYdb, setOrigin } from "./helpers";

type Row = Record<string, unknown>;
const run = process.env.YDB_ENDPOINT ? describe : describe.skip;
const base = { password: "s3cret-pass", country: "RU" as const, acceptTerms: true, acceptPd: true };
const q = async (strings: TemplateStringsArray, ...values: unknown[]) => {
  const sql = await ydb();
  const [rows] = await sql<[Row]>(strings, ...values);
  return rows;
};

run("YDB auth", () => {
  beforeEach(async () => {
    await resetYdb();
    reqState.cookies.clear();
    reqState.headers.clear();
  });
  afterAll(closeYdb);

  describe("registration", () => {
    it("creates user with lowercase email and both consents (version 2026-11)", async () => {
      const u = await registerUser({ ...base, email: "  Ivan@Mail.RU ", name: "Иван" });
      expect(u.email).toBe("ivan@mail.ru");
      expect(u.passwordHash).not.toContain("s3cret");
      const cs = await q`SELECT * FROM consents WHERE user_id = ${u.id}`;
      expect(cs.map((c) => c.type).sort()).toEqual(["pd_processing", "terms"]);
      expect(cs.every((c) => c.version === "2026-11")).toBe(true);
      const logs = await q`SELECT * FROM audit_logs WHERE action = ${"user.register"}`;
      expect(logs).toHaveLength(1);
      const [byEmail] = await q`SELECT * FROM users_by_email WHERE email = ${"ivan@mail.ru"}`;
      expect(byEmail.user_id).toBe(u.id);
      const [stored] = await q`SELECT * FROM users WHERE id = ${u.id}`;
      expect(stored).toMatchObject({ email: "ivan@mail.ru", name: "Иван", country: "RU", platform_role: "USER" });
    });
    it("requires both consents", async () => {
      await expect(registerUser({ ...base, email: "a@b.ru", acceptPd: false })).rejects.toMatchObject({ code: "VALIDATION" });
      await expect(registerUser({ ...base, email: "a@b.ru", acceptTerms: false })).rejects.toMatchObject({ code: "VALIDATION" });
      expect(await q`SELECT * FROM users`).toHaveLength(0);
    });
    it("rejects duplicate email (case-insensitive)", async () => {
      await registerUser({ ...base, email: "dup@x.ru" });
      await expect(registerUser({ ...base, email: "DUP@x.ru" })).rejects.toMatchObject({ code: "EMAIL_TAKEN" });
    });
    it("parallel registrations with the same email: exactly one succeeds", async () => {
      const res = await Promise.allSettled(Array.from({ length: 5 }, () => registerUser({ ...base, email: "race@x.ru" })));
      expect(res.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      for (const r of res) if (r.status === "rejected") expect(r.reason).toMatchObject({ code: "EMAIL_TAKEN" });
      expect(await q`SELECT * FROM users`).toHaveLength(1);
      expect(await q`SELECT * FROM consents`).toHaveLength(2);
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
      const sess = await q`SELECT * FROM sessions`;
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
      await q`UPDATE sessions SET expires_at = ${new Date(nowSec().getTime() - 1000)}`;
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
    it("platform admin by DB role", async () => {
      const u = await registerUser({ ...base, email: "root@x.ru" });
      await q`UPDATE users SET platform_role = ${"ADMIN"} WHERE id = ${u.id}`;
      await createSession(u.id);
      expect((await requirePlatformAdmin()).platformRole).toBe("ADMIN");
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
    it("10 parallel calls: exactly `limit` succeed", async () => {
      const res = await Promise.all(Array.from({ length: 10 }, () => rateLimit("conc10", 3, 60)));
      expect(res.filter((r) => r.ok)).toHaveLength(3);
      const [row] = await q`SELECT * FROM rate_limits WHERE \`key\` = ${"conc10"}`;
      expect(Number(row.count)).toBe(10);
    });
    it("resets after the window", async () => {
      await rateLimit("w", 1, 60);
      await q`UPDATE rate_limits SET window_start = ${new Date(nowSec().getTime() - 61_000)}`;
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
    it("anonymizes user, drops sessions, tokens & email lookup, keeps transactions", async () => {
      const { company, program } = await makeSetup();
      const u = await registerUser({ ...base, email: "gone@x.ru", name: "Пётр" });
      await createSession(u.id);
      const now = nowSec();
      const cardId = createId();
      await q`UPSERT INTO cards (program_id, customer_id, id, company_id, balance, last_activity_at, created_at)
              VALUES (${program.id}, ${u.id}, ${cardId}, ${company.id}, ${1}, ${now}, ${now})`;
      await q`UPSERT INTO transactions (id, company_id, card_id, type, amount, idempotency_key, created_at)
              VALUES (${createId()}, ${company.id}, ${cardId}, ${"ACCRUE"}, ${1}, ${"keep-me-123"}, ${now})`;
      await q`UPSERT INTO customer_tokens (token_hash, id, user_id, expires_at, created_at) VALUES (${"h1"}, ${createId()}, ${u.id}, ${new Date(now.getTime() + 60000)}, ${now})`;
      await deleteUserData(u.id);
      const [after] = await q`SELECT * FROM users WHERE id = ${u.id}`;
      expect(after.email).toBe(`deleted-${u.id}@deleted.invalid`);
      expect(after.name).toBeNull();
      expect(after.phone).toBeNull();
      expect(after.deleted_at).not.toBeNull();
      expect(after.password_hash).not.toBe(u.passwordHash);
      expect(await q`SELECT * FROM sessions WHERE user_id = ${u.id}`).toHaveLength(0);
      expect(await q`SELECT * FROM customer_tokens WHERE user_id = ${u.id}`).toHaveLength(0);
      expect(await q`SELECT * FROM users_by_email WHERE email = ${"gone@x.ru"}`).toHaveLength(0);
      expect(await q`SELECT * FROM transactions`).toHaveLength(1);
      await expect(loginUser("gone@x.ru", "s3cret-pass")).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
      expect(await getCurrentUser()).toBeNull();
      // The address is free again after deletion.
      await expect(registerUser({ ...base, email: "gone@x.ru" })).resolves.toMatchObject({ email: "gone@x.ru" });
    });
    it("audit never throws", async () => {
      await expect(audit("x".repeat(500), { meta: { a: 1 } })).resolves.toBeUndefined();
      const [row] = await q`SELECT * FROM audit_logs`;
      expect(String(row.action)).toHaveLength(100);
    });
    it("trackEvent stores anonymous events and ignores unknown types", async () => {
      await trackEvent("page_view", { country: "BY", path: "/by?utm=x#y", source: "weird" });
      await trackEvent("nope");
      const rows = await q`SELECT * FROM analytics_events`;
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ type: "page_view", country: "BY", path: "/by", source: "direct", company_id: null });
    });
  });
});
