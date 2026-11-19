import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("next/headers", async () => (await import("./helpers")).nextHeadersMock);
vi.mock("next/navigation", async () => (await import("./helpers")).nextNavigationMock);

import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/server/db";
import {
  exportCompanyCsv,
  exportCompanyTransactionsCsv,
  joinProgram,
  listCustomers,
} from "@/server/loyalty/service";
import { makeSetup, makeUser, resetDb } from "./helpers";

beforeEach(resetDb);

describe("business customer list and CSV tenant isolation", () => {
  it("excludes mismatched card/program and transaction/card tenants from rows, counts and exports", async () => {
    const a = await makeSetup({ plan: "TOP" });
    const b = await makeSetup({ plan: "TOP" });
    const alice = await makeUser({ name: "Только A" });
    const bob = await makeUser({ name: "Только B" });
    const cardA = await joinProgram(alice.id, a.program.id);
    const cardB = await joinProgram(bob.id, b.program.id);

    const [validA, wrongTenant, validB] = await db.insert(schema.transactions).values([
      { companyId: a.company.id, cardId: cardA.id, type: "ACCRUE", amount: 2, idempotencyKey: "list-export-valid-a" },
      // Deliberately inconsistent legacy row: A's transaction on B's card.
      { companyId: a.company.id, cardId: cardB.id, type: "ACCRUE", amount: 999, idempotencyKey: "list-export-foreign-card" },
      { companyId: b.company.id, cardId: cardB.id, type: "ACCRUE", amount: 3, idempotencyKey: "list-export-valid-b" },
    ]).returning({ id: schema.transactions.id });

    const initialA = await listCustomers(a.company.id, { limit: 10, offset: 0 });
    expect(initialA.total).toBe(1);
    expect(initialA.items.map((item) => item.cardId)).toEqual([cardA.id]);
    const initialACards = await exportCompanyCsv(a.company.id);
    expect(initialACards).toContain(cardA.id);
    expect(initialACards).not.toContain(cardB.id);

    const initialATransactions = await exportCompanyTransactionsCsv(a.company.id);
    expect(initialATransactions).toContain(validA.id);
    expect(initialATransactions).not.toContain(wrongTenant.id);
    expect(initialATransactions).not.toContain(validB.id);

    const initialBTransactions = await exportCompanyTransactionsCsv(b.company.id);
    expect(initialBTransactions).toContain(validB.id);
    expect(initialBTransactions).not.toContain(wrongTenant.id);

    // Deliberate legacy corruption: A's card now points at B's program.
    await db.update(schema.cards)
      .set({ programId: b.program.id })
      .where(eq(schema.cards.id, cardA.id));

    const after = await listCustomers(a.company.id, { limit: 10, offset: 0 });
    expect(after).toEqual({ items: [], total: 0 });
    const searched = await listCustomers(a.company.id, { q: alice.email, limit: 10, offset: 0 });
    expect(searched).toEqual({ items: [], total: 0 });

    const aCards = await exportCompanyCsv(a.company.id);
    expect(aCards).not.toContain(cardA.id);
    expect(aCards).not.toContain(alice.email);
    const aTransactions = await exportCompanyTransactionsCsv(a.company.id);
    expect(aTransactions).not.toContain(validA.id);
    expect(aTransactions).not.toContain(wrongTenant.id);

    // Company B must still only see its own card and transactions.
    const bList = await listCustomers(b.company.id, { limit: 10, offset: 0 });
    expect(bList.total).toBe(1);
    expect(bList.items.map((item) => item.cardId)).toEqual([cardB.id]);
    const bCards = await exportCompanyCsv(b.company.id);
    expect(bCards).toContain(cardB.id);
    expect(bCards).not.toContain(cardA.id);
    const bTransactions = await exportCompanyTransactionsCsv(b.company.id);
    expect(bTransactions).toContain(validB.id);
    expect(bTransactions).not.toContain(validA.id);
    expect(bTransactions).not.toContain(wrongTenant.id);
  });

  it("keeps pagination stable when many customer cards have identical activity timestamps", async () => {
    const setup = await makeSetup({ plan: "TOP" });
    const customers = await Promise.all(Array.from({ length: 9 }, () => makeUser()));
    const cards = await Promise.all(customers.map((customer) => joinProgram(customer.id, setup.program.id)));
    const at = new Date("2026-11-19T10:00:00.000Z");
    await db.update(schema.cards)
      .set({ lastActivityAt: at })
      .where(eq(schema.cards.companyId, setup.company.id));

    const ordered = await db.select({ id: schema.cards.id })
      .from(schema.cards)
      .where(eq(schema.cards.companyId, setup.company.id))
      .orderBy(desc(schema.cards.lastActivityAt), desc(schema.cards.id));
    const actual: string[] = [];
    for (let page = 0; page < 3; page++) {
      const response = await listCustomers(setup.company.id, { limit: 3, offset: page * 3 });
      expect(response.total).toBe(9);
      expect(response.items).toHaveLength(3);
      actual.push(...response.items.map((item) => item.cardId));
    }
    expect(actual).toEqual(ordered.map((r) => r.id));
    expect(new Set(actual).size).toBe(9);
    expect(cards).toHaveLength(9);
  });
});
