import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("next/headers", async () => (await import("./helpers")).nextHeadersMock);
vi.mock("next/navigation", async () => (await import("./helpers")).nextNavigationMock);

import { desc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { joinProgram, listTransactions } from "@/server/loyalty/service";
import { makeSetup, makeUser, resetDb } from "./helpers";

beforeEach(resetDb);

describe("business card transaction history", () => {
  it("paginates more than 100 operations with deterministic order for tied timestamps", async () => {
    const setup = await makeSetup({ plan: "TOP" });
    const customer = await makeUser();
    const card = await joinProgram(customer.id, setup.program.id);

    const inserted = await db.insert(schema.transactions).values(
      Array.from({ length: 126 }, (_, i) => ({
        companyId: setup.company.id, cardId: card.id,
        type: "ACCRUE" as const, amount: i + 1,
        idempotencyKey: `business-history-${i}-unique`,
      })),
    ).returning({ id: schema.transactions.id });

    await db.execute(sql`UPDATE transactions SET created_at = '2026-11-19T11:00:00.123456+00'::timestamptz`);
    const all: string[] = [];
    for (let page = 0; page < 6; page++) {
      const result = await listTransactions(setup.company.id, {
        cardId: card.id, limit: 25, offset: page * 25,
      });
      expect(result.total).toBe(126);
      expect(result.items).toHaveLength(page < 5 ? 25 : 1);
      all.push(...result.items.map((item) => item.id));
    }
    const dbOrder = await db.select({ id: schema.transactions.id })
      .from(schema.transactions)
      .where(inArray(schema.transactions.id, inserted.map((item) => item.id)))
      .orderBy(desc(schema.transactions.createdAt), desc(schema.transactions.id));
    expect(all).toEqual(dbOrder.map((item) => item.id));
    expect(new Set(all).size).toBe(126);
  });

  it("never mixes operations with a card or program belonging to another business", async () => {
    const a = await makeSetup({ plan: "TOP" });
    const b = await makeSetup({ plan: "TOP" });
    const userA = await makeUser();
    const userB = await makeUser();
    const cardA = await joinProgram(userA.id, a.program.id);
    const cardB = await joinProgram(userB.id, b.program.id);
    const [foreign, valid] = await db.insert(schema.transactions).values([
      {
        companyId: a.company.id, cardId: cardA.id, type: "ACCRUE", amount: 8,
        idempotencyKey: "business-cross-tenant-bad",
      },
      {
        companyId: b.company.id, cardId: cardB.id, type: "ACCRUE", amount: 9,
        idempotencyKey: "business-cross-tenant-good",
      },
    ]).returning({ id: schema.transactions.id });

    // Legacy corruption: this transaction is assigned to B but its card
    // and program actually belong to A. Neither list items nor totals may
    // count it as B's operation or disclose A's program name.
    await db.update(schema.transactions).set({ companyId: b.company.id })
      .where(eq(schema.transactions.id, foreign.id));

    const listB = await listTransactions(b.company.id, { limit: 25, offset: 0 });
    expect(listB.total).toBe(1);
    expect(listB.items.map((tx) => tx.id)).toEqual([valid.id]);
    expect(listB.items[0].programName).toBe(b.program.name);

    expect(await listTransactions(a.company.id, {
      cardId: cardA.id, limit: 25, offset: 0,
    })).toEqual({ items: [], total: 0 });

    // Another corrupted row: card is from A but program points to B.
    await db.update(schema.cards).set({ programId: b.program.id })
      .where(eq(schema.cards.id, cardA.id));
    expect((await listTransactions(a.company.id, { limit: 25, offset: 0 })).items)
      .toHaveLength(0);
    expect((await listTransactions(b.company.id, { limit: 25, offset: 0 })).total)
      .toBe(1);
  });
});
