import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/server/db";

describe("customer history database indexes", () => {
  it("has a customer-leading index so wallet and history do not scan all cards", async () => {
    const result = await db.execute(sql`
      SELECT indexdef
      FROM pg_indexes
      WHERE schemaname = current_schema()
        AND tablename = 'cards'
        AND indexname = 'cards_customer_idx'
    `);
    expect(result.rows).toHaveLength(1);
    expect(String(result.rows[0].indexdef)).toMatch(/\(customer_id\)/);
  });

  it("retains the newest-first transaction-card index", async () => {
    const result = await db.execute(sql`
      SELECT indexdef
      FROM pg_indexes
      WHERE schemaname = current_schema()
        AND tablename = 'transactions'
        AND indexname = 'tx_card_history_idx'
    `);
    expect(result.rows).toHaveLength(1);
    const definition = String(result.rows[0].indexdef);
    expect(definition).toContain("card_id");
    expect(definition).toContain("created_at DESC");
  });
});
