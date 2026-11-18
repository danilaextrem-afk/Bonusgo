import { describe, expect, it } from "vitest";
import { computePoints, csvCell, csvRow, isValidColor, isValidLogoUrl, maskEmail, parseCustomerToken, slugify } from "@/server/loyalty/utils";

describe("CSV escaping", () => {
  it("neutralizes formula injection", () => {
    for (const p of ["=", "+", "-", "@", "\t", "\r"]) expect(csvCell(`${p}SUM(A1)`).replace(/^"/, "").startsWith("'")).toBe(true);
    expect(csvCell("=HYPERLINK(\"x\")")).toBe('"\'=HYPERLINK(""x"")"');
  });
  it("quotes commas, quotes and newlines", () => {
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
    expect(csvCell(null)).toBe("");
    expect(csvRow(["a", 1, "b"])).toBe("a,1,b");
  });
  it("leaves plain values alone", () => {
    expect(csvCell("Кофейня")).toBe("Кофейня");
    expect(csvCell(42)).toBe("42");
  });
});

describe("points math", () => {
  it("floors purchaseMinor * percent / 10000", () => {
    expect(computePoints(100_00, 5)).toBe(5); // 100 ₽ × 5% = 5
    expect(computePoints(199_99, 5)).toBe(9);
    expect(computePoints(1, 50)).toBe(0);
    expect(computePoints(10_000_000, 50)).toBe(50_000);
  });
  it("rejects out-of-range input", () => {
    expect(() => computePoints(0, 5)).toThrow();
    expect(() => computePoints(10_000_001, 5)).toThrow();
    expect(() => computePoints(100, 51)).toThrow();
    expect(() => computePoints(1.5, 5)).toThrow();
  });
});

describe("slugify", () => {
  it("transliterates Russian/Belarusian", () => {
    expect(slugify("Кофейня «Утро»")).toBe("kofeynya-utro");
    expect(slugify("Шаурма №1")).toBe("shaurma-no1");
    expect(slugify("Ўсход")).toBe("ushod");
    expect(slugify("Café Déjà Vu")).toBe("cafe-deja-vu");
  });
  it("falls back for empty / symbol-only names", () => {
    expect(slugify("!!!")).toBe("venue");
    expect(slugify("a".repeat(100)).length).toBeLessThanOrEqual(40);
  });
});

describe("misc validators", () => {
  it("masks email", () => {
    expect(maskEmail("ivan@mail.ru")).toBe("iv***@mail.ru");
    expect(maskEmail("a@b.by")).toBe("a***@b.by");
  });
  it("parses customer token with or without prefix", () => {
    const t = "abcdefghijklmnopqrstuvwxyzABCDEF";
    expect(parseCustomerToken(`BG1.${t}`)).toBe(t);
    expect(parseCustomerToken(t)).toBe(t);
    expect(parseCustomerToken("BG1.<script>")).toBeNull();
  });
  it("validates colors and logos", () => {
    expect(isValidColor("#39FF88")).toBe(true);
    expect(isValidColor("red")).toBe(false);
    expect(isValidLogoUrl("https://cdn.example.com/logo.png")).toBe(true);
    expect(isValidLogoUrl("http://cdn.example.com/logo.png")).toBe(false);
    expect(isValidLogoUrl("javascript:alert(1)")).toBe(false);
    expect(isValidLogoUrl("data:image/png;base64,iVBORw0KGgo=")).toBe(true);
    expect(isValidLogoUrl("data:image/svg+xml;base64,PHN2Zz4=")).toBe(false);
    expect(isValidLogoUrl("data:image/png;base64," + "A".repeat(280_000))).toBe(false);
  });
});
