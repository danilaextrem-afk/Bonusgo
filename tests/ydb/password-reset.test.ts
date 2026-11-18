import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("next/headers", async () => (await import("./helpers")).nextHeadersMock);
vi.mock("next/navigation", async () => (await import("./helpers")).nextNavigationMock);
import { closeYdb, ydb } from "@/server/ydb/client";
import { nowSec } from "@/server/ydb/values";
import { requestPasswordReset, resetPassword } from "@/server/auth/reset";
import { verifyPassword } from "@/server/auth/password";
import { makeUser, reqState, resetYdb } from "./helpers";

type Row = Record<string, unknown>;
const run = process.env.YDB_ENDPOINT ? describe : describe.skip;
const q = async (strings: TemplateStringsArray, ...values: unknown[]) => {
  const sql = await ydb();
  const [rows] = await sql<[Row]>(strings, ...values);
  return rows;
};

const fetchMock = vi.fn();
let sentLink = "";

run("YDB password reset", () => {
  beforeEach(async () => {
    await resetYdb();
    reqState.cookies.clear();
    reqState.headers.clear();
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (_url: string, init: { body: string }) => {
      sentLink = /\/reset\/([\w-]+)/.exec(JSON.parse(init.body).text)?.[1] ?? "";
      return new Response("{}");
    });
    vi.stubGlobal("fetch", fetchMock);
    Object.assign(process.env, { RESEND_API_KEY: "k", EMAIL_FROM: "QRonus <no-reply@example.com>", APP_URL: "https://qronus.example" });
  });
  afterAll(async () => {
    vi.unstubAllGlobals();
    await closeYdb();
  });

  it("emails a one-time link, sets the new password, kills sessions; the link cannot be reused", async () => {
    const u = await makeUser();
    await q`UPSERT INTO sessions (id, user_id, csrf_token, expires_at, created_at) VALUES (${"s1"}, ${u.id}, ${"c"}, ${new Date(nowSec().getTime() + 3600_000)}, ${nowSec()})`;
    await requestPasswordReset(u.email);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sentLink.length).toBeGreaterThan(20);
    await resetPassword(sentLink, "new-password-123");
    const [after] = await q`SELECT * FROM users WHERE id = ${u.id}`;
    expect(await verifyPassword("new-password-123", String(after.password_hash))).toBe(true);
    expect(await q`SELECT * FROM sessions WHERE user_id = ${u.id}`).toHaveLength(0);
    await expect(resetPassword(sentLink, "another-password")).rejects.toMatchObject({ code: "INVALID_TOKEN" });
  });

  it("concurrent use of one link: exactly one succeeds", async () => {
    const u = await makeUser();
    await requestPasswordReset(u.email);
    const res = await Promise.allSettled(Array.from({ length: 5 }, (_, i) => resetPassword(sentLink, `new-password-${i}00`)));
    expect(res.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });

  it("other outstanding links stop working after a reset", async () => {
    const u = await makeUser();
    await requestPasswordReset(u.email);
    const first = sentLink;
    await requestPasswordReset(u.email);
    expect(sentLink).not.toBe(first);
    await resetPassword(sentLink, "new-password-123");
    await expect(resetPassword(first, "another-password")).rejects.toMatchObject({ code: "INVALID_TOKEN" });
  });

  it("does not reveal unknown emails and sends nothing", async () => {
    await expect(requestPasswordReset("nobody@example.com")).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("expired links do not work", async () => {
    const u = await makeUser();
    await requestPasswordReset(u.email);
    await q`UPDATE password_resets SET expires_at = ${new Date(nowSec().getTime() - 1000)}`;
    await expect(resetPassword(sentLink, "new-password-123")).rejects.toMatchObject({ code: "INVALID_TOKEN" });
  });

  it("limits emails per address to 3 per hour", async () => {
    const u = await makeUser();
    for (let i = 0; i < 5; i++) await requestPasswordReset(u.email);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
