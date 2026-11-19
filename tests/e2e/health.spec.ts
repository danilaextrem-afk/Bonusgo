import { expect, test } from "@playwright/test";

test("health exposes a safe, non-cached deployment revision", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect(response.headers()["x-robots-tag"]).toContain("noindex");

  const payload = (await response.json()) as {
    ok?: unknown;
    time?: unknown;
    revision?: unknown;
  };
  expect(payload.ok).toBe(true);
  expect(typeof payload.time).toBe("string");
  expect(Number.isFinite(Date.parse(payload.time as string))).toBe(true);
  expect(payload.revision === null || (typeof payload.revision === "string" && /^[a-f0-9]{12}$/.test(payload.revision))).toBe(true);
  expect(Object.keys(payload).sort()).toEqual(["ok", "revision", "time"]);
});
