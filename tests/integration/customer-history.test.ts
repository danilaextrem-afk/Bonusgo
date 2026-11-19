import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("next/headers", async () => (await import("./helpers")).nextHeadersMock);
vi.mock("next/navigation", async () => (await import("./helpers")).nextNavigationMock);

import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { listCustomerHistory } from "@/server/loyalty/customer-history";
import { joinProgram } from "@/server/loyalty/service";
import { makeSetup, makeUser, resetDb } from "./helpers";

beforeEach(resetDb);

describe("authenticated account-scoped full history", () => {
  it("reads all own operations in 20-item pages with tied microsecond timestamps", async () => {
    const first = await makeSetup({ plan: "TOP" });
    const second = await makeSetup({ plan: "TOP" });
    const customer = await makeUser();
    const outsider = await makeUser();
    const a = await joinProgram(customer.id, first.program.id);
    const b = await joinProgram(customer.id, second.program.id);
    const foreignCard = await joinProgram(outsider.id, first.program.id);

    const ownRows = Array.from({ length: 47 }, (_, i) => ({
      companyId: i % 2 === 0 ? first.company.id : second.company.id,
      cardId: i % 2 === 0 ? a.id : b.id,
      type: "ACCRUE" as const,
      amount: i + 1,
      idempotencyKey: `my-history-${i}-test`,
    }));
    const own = await db.insert(schema.transactions).values(ownRows).returning({ id: schema.transactions.id });
    await db.insert(schema.transactions).values({
      companyId: first.company.id, cardId: foreignCard.id, type: "ACCRUE",
      amount: 999, idempotencyKey: "other-history-test",
    });
    // Force identical PostgreSQL microsecond timestamps. Converting to JS Date
    // before building the cursor would lose those last three digits.
    await db.execute(sql`UPDATE transactions SET created_at = '2026-11-19T12:13:14.123456+00'::timestamptz`);

    const seen: string[] = [];
    let cursor: string | undefined;
    const pageSizes: number[] = [];
    for (let page = 0; page < 4; page++) {
      const response = await listCustomerHistory(customer.id, cursor);
      pageSizes.push(response.items.length);
      seen.push(...response.items.map((item) => item.id));
      expect(response.items.every((item) => item.amount !== 999)).toBe(true);
      expect(response.items.every((item) => item.companyName === first.company.name ||
        item.companyName === second.company.name)).toBe(true);
      if (!response.nextCursor) break;
      cursor = response.nextCursor;
    }

    expect(pageSizes).toEqual([20, 20, 7]);
    expect(new Set(seen).size).toBe(47);
    expect([...seen].sort()).toEqual(own.map((row) => row.id).sort());
    expect(seen).toEqual([...seen].sort().reverse());
    expect(await listCustomerHistory((await makeUser()).id)).toEqual({ items: [], nextCursor: null });
  });

  it("does not return deleted-company transactions or another account's records", async () => {
    const first = await makeSetup();
    const second = await makeSetup();
    const user = await makeUser();
    const a = await joinProgram(user.id, first.program.id);
    const b = await joinProgram(user.id, second.program.id);
    const txs = await db.insert(schema.transactions).values([
      { companyId: first.company.id, cardId: a.id, type: "ACCRUE", amount: 1, idempotencyKey: "visible-history-test" },
      { companyId: second.company.id, cardId: b.id, type: "ACCRUE", amount: 2, idempotencyKey: "hidden-history-test" },
    ]).returning({ id: schema.transactions.id });
    await db.update(schema.companies).set({ deletedAt: new Date() }).where(eq(schema.companies.id, second.company.id));
    const report = await listCustomerHistory(user.id);
    expect(report.items.map((x) => x.id)).toEqual([txs[0].id]);
    expect(report.nextCursor).toBeNull();
  });
});
