import { describe, expect, it } from "vitest";
import { publicDeploymentRevision } from "@/lib/deployment-revision";

describe("public Render deployment revision", () => {
  it("returns a lowercase 12-character SHA prefix for a valid Git revision", () => {
    const sha = "A7B8C9D01234567890ABCDEF0123456789ABCDEF";
    expect(publicDeploymentRevision(sha)).toBe("a7b8c9d01234");
  });
  it.each([
    undefined,
    "",
    "main",
    "local",
    "deadbeef",
    "g".repeat(40),
    "0".repeat(40) + "\nPASSWORD=secret",
  ])("returns null instead of echoing untrusted deploy metadata: %s", (revision) => {
    expect(publicDeploymentRevision(revision)).toBeNull();
  });
});
