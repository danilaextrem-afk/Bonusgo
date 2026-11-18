import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const audit = vi.fn(async () => {});
vi.mock("@/server/audit", () => ({ audit: (...a: unknown[]) => (audit as (...x: unknown[]) => unknown)(...a) }));

import { notifyOwner } from "@/server/notify";

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  audit.mockClear();
  vi.stubGlobal("fetch", fetchMock);
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_CHAT_ID;
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_CHAT_ID;
});

describe("notifyOwner", () => {
  it("is a no-op without env", async () => {
    await notifyOwner("hi");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts to Telegram sendMessage with env set", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "123:abc";
    process.env.TELEGRAM_CHAT_ID = "42";
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    await notifyOwner("Привет");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.telegram.org/bot123:abc/sendMessage");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ chat_id: "42", text: "Привет", disable_web_page_preview: true });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(audit).not.toHaveBeenCalled();
  });

  it("swallows network errors and audits without leaking the token", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "123:abc";
    process.env.TELEGRAM_CHAT_ID = "42";
    fetchMock.mockRejectedValue(new Error("boom 123:abc"));
    await expect(notifyOwner("x")).resolves.toBeUndefined();
    expect(audit).toHaveBeenCalledWith("error.notify_failed", { meta: { message: "boom ***" } });
  });

  it("swallows non-2xx responses", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "t";
    process.env.TELEGRAM_CHAT_ID = "1";
    fetchMock.mockResolvedValue(new Response("no", { status: 401 }));
    await expect(notifyOwner("x")).resolves.toBeUndefined();
    expect(audit).toHaveBeenCalledTimes(1);
  });
});
