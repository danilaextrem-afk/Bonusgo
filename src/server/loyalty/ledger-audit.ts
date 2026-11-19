import "server-only";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { AppError } from "@/server/errors";

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

/** Hard cap prevents an admin query from loading unlimited cards into memory. */
export const MAX_LEDGER_AUDIT_CARDS = 10_000;

export function assertLedgerAuditCapacity(cardsChecked: number): void {
  if (!Number.isSafeInteger(cardsChecked) || cardsChecked < 0)
    throw new RangeError("Invalid card count in ledger reconciliation");
  if (cardsChecked > MAX_LEDGER_AUDIT_CARDS)
    throw new AppError(
      "AUDIT_TOO_LARGE",
      "Слишком много карт для одной проверки. Используйте пакетную сверку.",
      413,
    );
}

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
    .groupBy(schema.cards.id, schema.cards.balance)
    // Never return a deceptively clean partial report if the company is too large.
    .limit(MAX_LEDGER_AUDIT_CARDS + 1);

  assertLedgerAuditCapacity(rows.length);

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
