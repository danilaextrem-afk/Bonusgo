import { describe, expect, it } from "vitest";
import { securityHeaders } from "@/server/security/headers";

describe("security headers", () => {
  it("includes strict CSP and hardening headers", () => {
    const h = Object.fromEntries(securityHeaders.map((x) => [x.key, x.value]));
    expect(h["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
    expect(h["Content-Security-Policy"]).toContain("form-action 'self' https://auth.robokassa.ru https://checkout.bepaid.by");
    expect(h["X-Frame-Options"]).toBe("DENY");
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect(h["Strict-Transport-Security"]).toContain("max-age=31536000");
  });
});

import { vi, describe as d2, it as i2, expect as e2 } from "vitest";
vi.mock("next/headers", () => ({
  headers: async () => new Map([["x-forwarded-for", "6.6.6.6, 203.0.113.7"]]),
}));
d2("getClientIp", () => {
  i2("ignores spoofed leftmost X-Forwarded-For entries", async () => {
    const { getClientIp } = await import("@/server/security/rateLimit");
    e2(await getClientIp()).toBe("203.0.113.7");
  });
});
