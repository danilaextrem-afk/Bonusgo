import { describe, expect, it } from "vitest";
import { loyaltyIntentFingerprint } from "@/server/loyalty/intent-fingerprint";

describe("canonical loyalty idempotency fingerprint", () => {
  const initial = { action: "ACCRUE" as const, programId: "program-one", kind: "stamps" as const, value: 2 };

  it("is deterministic and always 64 hexadecimal characters", () => {
    const hash = loyaltyIntentFingerprint(initial);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(loyaltyIntentFingerprint({ ...initial })).toBe(hash);
  });

  it("changes for a changed amount, program, action or reward identifier", () => {
    const original = loyaltyIntentFingerprint(initial);
    expect(loyaltyIntentFingerprint({ ...initial, value: 3 })).not.toBe(original);
    expect(loyaltyIntentFingerprint({ ...initial, programId: "program-two" })).not.toBe(original);
    expect(loyaltyIntentFingerprint({ ...initial, action: "REDEEM" })).not.toBe(original);
    expect(loyaltyIntentFingerprint({ action: "REDEEM", programId: "program-one", kind: "reward", value: "reward-one" }))
      .not.toBe(loyaltyIntentFingerprint({ action: "REDEEM", programId: "program-one", kind: "reward", value: "reward-two" }));
  });
});
