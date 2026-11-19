import { describe, expect, it } from "vitest";
import { assertLedgerAuditCapacity, MAX_LEDGER_AUDIT_CARDS } from "@/server/loyalty/ledger-audit";

describe("bounded ledger reconciliation", () => {
  it("accepts an empty result and the maximum safe report size", () => {
    expect(() => assertLedgerAuditCapacity(0)).not.toThrow();
    expect(() => assertLedgerAuditCapacity(MAX_LEDGER_AUDIT_CARDS)).not.toThrow();
  });

  it("rejects oversized audit results rather than silently truncating them", () => {
    expect(() => assertLedgerAuditCapacity(MAX_LEDGER_AUDIT_CARDS + 1)).toThrowError(
      expect.objectContaining({ code: "AUDIT_TOO_LARGE", status: 413 }),
    );
  });

  it.each([-1, NaN, Infinity, 0.5])("rejects invalid row counts: %s", (n) => {
    expect(() => assertLedgerAuditCapacity(n)).toThrow(RangeError);
  });
});
