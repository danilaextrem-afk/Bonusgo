import { describe, expect, it } from "vitest";
import {
  assertBatchLedgerCapacity,
  MAX_BATCH_LEDGER_CARDS,
  LEDGER_BATCH_SIZE,
  MAX_BATCH_LEDGER_SAMPLES,
} from "@/server/loyalty/batched-ledger-audit";

describe("batched ledger audit safety bounds", () => {
  it("uses bounded keyset pages and a small stored discrepancy sample", () => {
    expect(LEDGER_BATCH_SIZE).toBeGreaterThan(0);
    expect(LEDGER_BATCH_SIZE).toBeLessThanOrEqual(1000);
    expect(MAX_BATCH_LEDGER_SAMPLES).toBe(50);
    expect(MAX_BATCH_LEDGER_CARDS).toBeGreaterThan(10_000);
  });

  it("allows an empty and exact-cap audit but fails closed above the cap", () => {
    expect(() => assertBatchLedgerCapacity(0)).not.toThrow();
    expect(() => assertBatchLedgerCapacity(MAX_BATCH_LEDGER_CARDS)).not.toThrow();
    expect(() => assertBatchLedgerCapacity(MAX_BATCH_LEDGER_CARDS + 1))
      .toThrowError(expect.objectContaining({ code: "AUDIT_TOO_LARGE", status: 413 }));
  });

  it.each([-1, NaN, Infinity, 2.5])("rejects invalid batch card count %s", (value) => {
    expect(() => assertBatchLedgerCapacity(value)).toThrow(RangeError);
  });
});
