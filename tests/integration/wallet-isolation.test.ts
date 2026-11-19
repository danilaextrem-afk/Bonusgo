import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("next/headers", async () => (await import("./helpers")).nextHeadersMock);
vi.mock("next/navigation", async () => (await import("./helpers")).nextNavigationMock);

import { eq } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { getCustomerCards, joinProgram } from "@/server/loyalty/service";
import { walletHistoryPreview } from "@/server/loyalty/wallet-preview";
import { makeSetup, makeUser, resetDb } from "./helpers";

beforeEach(resetDb);

describe("customer wallet tenant boundaries", () => {
  it("never shows an operation assigned to another company, including overview", async () => {
    const a = await makeSetup();
    const b = await makeSetup();
    const customer = await makeUser();
    const cardA = await joinProgram(customer.id, a.program.id);
    const cardB = await joinProgram(customer.id, b.program.id);
    const [valid, misattributed] = await db.insert(schema.transactions).values([
      {
        companyId: a.company.id, cardId: cardA.id, type: "ACCRUE",
        amount: 5, idempotencyKey: "wallet-tenant-good",
      },
      {
        companyId: a.company.id, cardId: cardA.id, type: "ACCRUE",
        amount: 999, idempotencyKey: "wallet-tenant-corrupted",
      },
    ]).returning({ id: schema.transactions.id });

    await db.update(schema.transactions)
      .set({ companyId: b.company.id })
      .where(eq(schema.transactions.id, misattributed.id));

    const cards = await getCustomerCards(customer.id);
    expect(cards).toHaveLength(2);
    const aCard = cards.find(x => x.card.id === cardA.id);
    const bCard = cards.find(x => x.card.id === cardB.id);
    expect(aCard?.transactions.map(x => x.id)).toEqual([valid.id]);
    expect(bCard?.transactions).toEqual([]);
    expect(walletHistoryPreview(cards).map(x => x.id)).toEqual([valid.id]);
    expect(walletHistoryPreview(cards).some(x => x.amount === 999)).toBe(false);
  });

  it("does not display a card whose program is incorrectly linked to a foreign tenant", async () => {
    const a = await makeSetup();
    const b = await makeSetup();
    const customer = await makeUser();
    const card = await joinProgram(customer.id, a.program.id);
    await db.update(schema.cards).set({ programId: b.program.id })
      .where(eq(schema.cards.id, card.id));
    expect(await getCustomerCards(customer.id)).toEqual([]);
  });

  it("does not display a card whose program venue belongs to a foreign tenant", async () => {
    const a = await makeSetup();
    const b = await makeSetup();
    const customer = await makeUser();
    await joinProgram(customer.id, a.program.id);
    await db.update(schema.programs).set({ venueId: b.venue.id })
      .where(eq(schema.programs.id, a.program.id));
    expect(await getCustomerCards(customer.id)).toEqual([]);
  });
});
