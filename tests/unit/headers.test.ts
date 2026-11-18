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
