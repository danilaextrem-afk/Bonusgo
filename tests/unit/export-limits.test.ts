import { describe, expect, it } from "vitest";
import { assertCompleteExport, MAX_EXPORT_ROWS } from "@/server/loyalty/export-limits";

describe("CSV export completeness limits", () => {
  it("accepts an empty download and exactly 50,000 records", () => {
    expect(MAX_EXPORT_ROWS).toBe(50_000);
    expect(() => assertCompleteExport(0)).not.toThrow();
    expect(() => assertCompleteExport(MAX_EXPORT_ROWS)).not.toThrow();
  });

  it("rejects truncated CSV instead of silently presenting an incomplete export", () => {
    expect(() => assertCompleteExport(MAX_EXPORT_ROWS + 1))
      .toThrowError(expect.objectContaining({ code: "EXPORT_TOO_LARGE", status: 413 }));
  });

  it.each([-1, Number.NaN, Infinity, 2.5])("rejects invalid export count %s", (value) => {
    expect(() => assertCompleteExport(value)).toThrow(RangeError);
  });
});
