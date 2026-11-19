import { describe, expect, it } from "vitest";
import { parseExportPeriod } from "@/server/loyalty/export-period";

describe("UTC CSV export windows", () => {
  it("keeps the unfiltered historical export backward compatible", () => {
    expect(parseExportPeriod(undefined)).toBeNull();
    expect(parseExportPeriod(null)).toBeNull();
    expect(parseExportPeriod("")).toBeNull();
  });

  it("uses adjacent half-open UTC month windows, including leap year February", () => {
    expect(parseExportPeriod("2024-02")).toEqual({
      label: "2024-02",
      from: new Date("2024-02-01T00:00:00.000Z"),
      until: new Date("2024-03-01T00:00:00.000Z"),
    });
    expect(parseExportPeriod("2026-12")?.until).toEqual(new Date("2027-01-01T00:00:00.000Z"));
  });

  it("handles 29 February and last day of year without gaps or overlap", () => {
    expect(parseExportPeriod("2024-02-29")).toEqual({
      label: "2024-02-29",
      from: new Date("2024-02-29T00:00:00.000Z"),
      until: new Date("2024-03-01T00:00:00.000Z"),
    });
    expect(parseExportPeriod("2026-12-31")?.until).toEqual(new Date("2027-01-01T00:00:00.000Z"));
  });

  it.each([
    "2023-02-29", "2024-02-30", "2024-00", "2024-13", "2024-01-00",
    "2024-01-32", "2024-1", "2024-01-1", "2024-01-01T00:00",
    "2024-01%0A", "../2024-01", "1999-12", "9999-01",
  ])("rejects an invalid or unsafe export period: %s", (period) => {
    expect(() => parseExportPeriod(period)).toThrowError(
      expect.objectContaining({ code: "VALIDATION", status: 400 }),
    );
  });
});
