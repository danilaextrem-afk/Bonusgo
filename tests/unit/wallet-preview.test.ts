import { describe, expect, it } from "vitest";
import { walletHistoryPreview, WALLET_PREVIEW_SIZE } from "@/server/loyalty/wallet-preview";

const makeOps = (prefix: string, minutes: number[], amount: number) => minutes.map((m, i) => ({
  id: `${prefix}-${String(i).padStart(3, "0")}`,
  type: "ACCRUE",
  amount,
  createdAt: new Date(Date.UTC(2026, 10, 19, 12, m)),
}));

describe("wallet overview history", () => {
  it("selects newest 15 from two different cards, without mutating card histories", () => {
    const a = { program: { name: "Кофейня" }, transactions: makeOps("a", Array.from({ length: 20 }, (_, i) => i * 2), 1) };
    const b = { program: { name: "Пекарня" }, transactions: makeOps("b", Array.from({ length: 20 }, (_, i) => i * 2 + 1), 2) };
    const prevA = a.transactions.map(x => x.id);
    const prevB = b.transactions.map(x => x.id);
    const result = walletHistoryPreview([a, b]);
    expect(WALLET_PREVIEW_SIZE).toBe(15);
    expect(result).toHaveLength(15);
    expect(result[0].createdAt.toISOString()).toBe("2026-11-19T12:39:00.000Z");
    expect(result.at(-1)?.createdAt.toISOString()).toBe("2026-11-19T12:25:00.000Z");
    expect(result.map(x => x.program)).toContain("Кофейня");
    expect(result.map(x => x.program)).toContain("Пекарня");
    expect(a.transactions.map(x => x.id)).toEqual(prevA);
    expect(b.transactions.map(x => x.id)).toEqual(prevB);
  });

  it("handles empty histories and stable same-millisecond ties", () => {
    expect(walletHistoryPreview([])).toEqual([]);
    const date = new Date("2026-11-19T00:00:00Z");
    expect(walletHistoryPreview([
      { program: { name: "A" }, transactions: [{ id: "a", type: "ACCRUE", amount: 1, createdAt: date }] },
      { program: { name: "B" }, transactions: [{ id: "b", type: "REDEEM", amount: -1, createdAt: date }] },
    ])).toEqual([
      { id: "b", type: "REDEEM", amount: -1, createdAt: date, program: "B" },
      { id: "a", type: "ACCRUE", amount: 1, createdAt: date, program: "A" },
    ]);
  });
});
