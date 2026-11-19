import "server-only";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/server/db";

/**
 * Read-only balance reconciliation intended for controlled internal audits.
 * It never edits balances or exposes customer names, email addresses or QR tokens.
 * Do not expose this function through a public API without server-side authorization.
 */
export type LedgerDiscrepancy = {
  cardId: string;
  storedBalance: number;
  ledgerBalance: number;
  foreignTenantTransactions: number;
};

export type CompanyLedgerAudit = {
  companyId: string;
  cardsChecked: number;
  discrepancies: LedgerDiscrepancy[];
};

export async function auditCompanyLedger(companyId: string): Promise<CompanyLedgerAudit> {
  if (!companyId || typeof companyId !== "string")
    throw new TypeError("companyId is required");

  // Aggregate inside PostgreSQL to avoid large transaction downloads and JS
  // floating-point rounding. SUM(integer) is bigint, so read it as text.
  const rows = await db
    .select({
      cardId: schema.cards.id,
      storedBalance: schema.cards.balance,
      ledgerTotal: sql<string>`COALESCE(SUM(${schema.transactions.amount}), 0)::text`,
      foreignTenantCount: sql<string>`COUNT(*) FILTER (WHERE ${schema.transactions.companyId} <> ${schema.cards.companyId})::text`,
    })
    .from(schema.cards)
    .leftJoin(schema.transactions, eq(schema.transactions.cardId, schema.cards.id))
    .where(eq(schema.cards.companyId, companyId))
    .groupBy(schema.cards.id, schema.cards.balance);

  const discrepancies: LedgerDiscrepancy[] = [];
  for (const row of rows) {
    const ledgerBalance = Number(row.ledgerTotal);
    const foreignTenantTransactions = Number(row.foreignTenantCount);
    if (!Number.isSafeInteger(ledgerBalance) || !Number.isSafeInteger(foreignTenantTransactions))
      throw new RangeError("Ledger audit result outside safe integer range");
    if (row.storedBalance !== ledgerBalance || foreignTenantTransactions > 0 || row.storedBalance < 0) {
      discrepancies.push({
        cardId: row.cardId,
        storedBalance: row.storedBalance,
        ledgerBalance,
        foreignTenantTransactions,
      });
    }
  }

  return { companyId, cardsChecked: rows.length, discrepancies };
}
