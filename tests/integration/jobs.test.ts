import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("next/headers", async () => (await import("./helpers")).nextHeadersMock);
vi.mock("next/navigation", async () => (await import("./helpers")).nextNavigationMock);
import { eq } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { runDueJobs } from "@/server/jobs";
import { makeCompany, makeUser, resetDb } from "./helpers";

beforeEach(async () => {
  await resetDb();
  delete process.env.TELEGRAM_BOT_TOKEN;
});

describe("background jobs", () => {
  it("expires lapsed plans once per interval, even when triggered repeatedly", async () => {
    const u = await makeUser();
    const c = await makeCompany(u.id, { plan: "PRO", planExpiresAt: new Date(Date.now() - 1000) });
    const [first, second] = [await runDueJobs(), await runDueJobs()];
    expect(first).toContain("expire-subscriptions");
    expect(second).not.toContain("expire-subscriptions");
    const [after] = await db.select().from(schema.companies).where(eq(schema.companies.id, c.id));
    expect(after.plan).toBe("FREE");
  });

  it("skips IndexNow outside production and the Telegram reminder without a bot token", async () => {
    const ran = await runDueJobs();
    expect(ran).not.toContain("indexnow");
    expect(ran).not.toContain("sbp-reminder");
  });

  it("reminds the owner about SBP claims older than 12 hours", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "t";
    process.env.TELEGRAM_CHAT_ID = "1";
    const fetchMock = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);
    const u = await makeUser();
    const c = await makeCompany(u.id);
    await db.insert(schema.payments).values({ companyId: c.id, provider: "sbp", plan: "PRO", amountMinor: 99000, currency: "RUB", testMode: false, claimedAt: new Date(Date.now() - 13 * 3600_000) });
    expect(await runDueJobs()).toContain("sbp-reminder");
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toContain("api.telegram.org");
    vi.unstubAllGlobals();
    delete process.env.TELEGRAM_CHAT_ID;
  });
});
