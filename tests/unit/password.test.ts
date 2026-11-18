import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/server/auth/password";

describe("password hashing", () => {
  it("hashes with bcrypt cost 12 and verifies", async () => {
    const h = await hashPassword("correct horse");
    expect(h).toMatch(/^\$2[aby]\$12\$/);
    expect(await verifyPassword("correct horse", h)).toBe(true);
    expect(await verifyPassword("wrong horse", h)).toBe(false);
  });
  it("rejects short passwords", async () => {
    await expect(hashPassword("1234567")).rejects.toThrow();
  });
  it("verify is false for garbage hash", async () => {
    expect(await verifyPassword("whatever1", "not-a-hash")).toBe(false);
  });
});
