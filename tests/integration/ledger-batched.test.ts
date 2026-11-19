import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("next/headers", async () => (await import("./helpers")).nextHeadersMock);
vi.mock("next/navigation", async () => (await import("./helpers")).nextNavigationMock);
import { eq } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { createSession } from "@/server/auth/session";
import { runAdminLedgerAudit } from "@/server/loyalty/admin-ledger";
import { makeSetup, makeUser, resetDb } from "./helpers";

beforeEach(resetDb);

describe("consistent multi-page read-only ledger audits", () => {
  it("reads more than one batch and records exact discrepancy counts without writes", async () => {
    const setup = await makeSetup();
    const admin = await makeUser({ platformRole: "ADMIN" });
    await createSession(admin.id);

    const customers = await db.insert(schema.users)
      .values(Array.from({ length: 505 }, (_, i) => ({
        email: `batched-ledger-${i}@test.local`,
        passwordHash: "test",
      })))
      .returning({ id: schema.users.id });

    const cards = await db.insert(schema.cards)
      .values(customers.map((customer) => ({
        companyId: setup.company.id,
        programId: setup.program.id,
        customerId: customer.id,
        balance: 0,
      })))
      .returning({ id: schema.cards.id });
    expect(cards).toHaveLength(505);

    await db.update(schema.cards).set({ balance: 9 })
      .where(eq(schema.cards.id, cards[0].id));
    await db.update(schema.cards).set({ balance: 3 })
      .where(eq(schema.cards.id, cards[504].id));

    const report = await runAdminLedgerAudit(setup.company.id, "batched");
    expect(report).toMatchObject({
      companyId: setup.company.id,
      cardsChecked: 505,
      discrepancyCount: 2,
      sampleTruncated: false,
      consistentSnapshot: true,
    });
    expect(report.discrepancies).toHaveLength(2);
    expect(report.discrepancies.map((row) => row.storedBalance).sort((a, b) => a - b))
      .toEqual([3, 9]);

    const unchanged = await db.select({ balance: schema.cards.balance })
      .from(schema.cards).where(eq(schema.cards.id, cards[0].id));
    expect(unchanged[0].balance).toBe(9);

    const audit = await db.select().from(schema.auditLogs);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ action: "loyalty.ledger.mismatch", companyId: setup.company.id });
    expect(audit[0].meta).toMatchObject({
      cardsChecked: 505, discrepancyCount: 2, mode: "batched",
    });
  });

  it("returns the exact mismatch total even when only 50 card samples are retained", async () => {
    const setup = await makeSetup();
    const admin = await makeUser({ platformRole: "ADMIN" });
    await createSession(admin.id);

    const customers = await db.insert(schema.users)
      .values(Array.from({ length: 55 }, (_, i) => ({
        email: `bad-ledger-${i}@test.local`,
        passwordHash: "test",
      })))
      .returning({ id: schema.users.id });
    await db.insert(schema.cards).values(customers.map((customer) => ({
      companyId: setup.company.id,
      programId: setup.program.id,
      customerId: customer.id,
      balance: 1,
    })));

    const report = await runAdminLedgerAudit(setup.company.id, "batched");
    expect(report).toMatchObject({
      cardsChecked: 55, discrepancyCount: 55,
      sampleTruncated: true, consistentSnapshot: true,
    });
    expect(report.discrepancies).toHaveLength(50);
    expect((await db.select().from(schema.cards)).every((row) => row.balance === 1)).toBe(true);
  });
});
