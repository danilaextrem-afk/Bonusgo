import { beforeEach, describe, expect, it, vi } from "vitest";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/server/db", () => ({ db: { execute: query } }));

import { GET as getLiveness } from "@/app/api/live/route";
import { GET as getReadiness } from "@/app/api/ready/route";

beforeEach(() => query.mockReset());

describe("separate liveness and database readiness", () => {
  it("process liveness is immediate, side-effect-free and never calls PostgreSQL", async () => {
    const response = getLiveness();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("x-robots-tag")).toContain("noindex");
    expect(query).not.toHaveBeenCalled();
  });

  it("readiness succeeds when PostgreSQL responds to a read-only probe", async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const response = await getReadiness();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("readiness fails closed with HTTP 503 without disclosing database errors", async () => {
    query.mockRejectedValueOnce(new Error("secret DB password: example-only"));
    const response = await getReadiness();
    expect(response.status).toBe(503);
    const body = await response.text();
    expect(JSON.parse(body)).toEqual({ ok: false });
    expect(body).not.toContain("password");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("x-robots-tag")).toContain("noindex");
    expect(query).toHaveBeenCalledTimes(1);
  });
});
