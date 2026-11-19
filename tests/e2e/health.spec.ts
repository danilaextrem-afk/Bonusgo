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


test("version endpoint is a side-effect-free, non-cached deployment probe", async ({ request }) => {
  const first = await request.get("/api/version");
  const second = await request.get("/api/version");
  for (const response of [first, second]) {
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toContain("no-store");
    expect(response.headers()["x-robots-tag"]).toContain("noindex");
    const payload = (await response.json()) as Record<string, unknown>;
    expect(Object.keys(payload)).toEqual(["revision"]);
    expect(payload.revision === null || (typeof payload.revision === "string" && /^[a-f0-9]{12}$/.test(payload.revision))).toBe(true);
  }
  expect(await first.json()).toEqual(await second.json());
});


test("Render liveness endpoint is public, tiny and never caches", async ({ request }) => {
  const response = await request.get("/api/live");
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ ok: true });
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect(response.headers()["x-robots-tag"]).toContain("noindex");
});

test("database readiness is independent of Render process liveness", async ({ request }) => {
  // CI supplies a dedicated PostgreSQL service and applies its migrations.
  const response = await request.get("/api/ready");
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ ok: true });
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect(response.headers()["x-robots-tag"]).toContain("noindex");
});
