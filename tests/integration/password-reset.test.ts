import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("next/headers", async () => (await import("./helpers")).nextHeadersMock);
vi.mock("next/navigation", async () => (await import("./helpers")).nextNavigationMock);
import { eq } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { requestPasswordReset, resetPassword } from "@/server/auth/reset";
import { verifyPassword } from "@/server/auth/password";
import { makeUser, resetDb } from "./helpers";

const fetchMock = vi.fn();
let sentLink = "";

beforeEach(async () => {
  await resetDb();
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (_url: string, init: { body: string }) => {
    sentLink = /\/reset\/([\w-]+)/.exec(JSON.parse(init.body).text)?.[1] ?? "";
    return new Response("{}");
  });
  vi.stubGlobal("fetch", fetchMock);
  Object.assign(process.env, { RESEND_API_KEY: "k", EMAIL_FROM: "QRonus <no-reply@example.com>", APP_URL: "https://qronus.example" });
});

describe("password reset", () => {
  it("emails a one-time link, sets the new password, kills sessions; the link cannot be reused", async () => {
    const u = await makeUser();
    await db.insert(schema.sessions).values({ id: "s1", userId: u.id, csrfToken: "c", expiresAt: new Date(Date.now() + 3600_000) });
    await requestPasswordReset(u.email);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sentLink.length).toBeGreaterThan(20);
    await resetPassword(sentLink, "new-password-123");
    const [after] = await db.select().from(schema.users).where(eq(schema.users.id, u.id));
    expect(await verifyPassword("new-password-123", after.passwordHash)).toBe(true);
    expect(await db.select().from(schema.sessions).where(eq(schema.sessions.userId, u.id))).toHaveLength(0);
    await expect(resetPassword(sentLink, "another-password")).rejects.toMatchObject({ code: "INVALID_TOKEN" });
  });

  it("does not reveal unknown emails and sends nothing", async () => {
    await expect(requestPasswordReset("nobody@example.com")).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("expired links do not work", async () => {
    const u = await makeUser();
    await requestPasswordReset(u.email);
    await db.update(schema.passwordResets).set({ expiresAt: new Date(Date.now() - 1000) });
    await expect(resetPassword(sentLink, "new-password-123")).rejects.toMatchObject({ code: "INVALID_TOKEN" });
  });

  it("limits emails per address to 3 per hour", async () => {
    const u = await makeUser();
    for (let i = 0; i < 5; i++) await requestPasswordReset(u.email);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
