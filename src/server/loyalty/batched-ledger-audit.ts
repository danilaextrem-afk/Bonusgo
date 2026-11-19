import "server-only";
import { and, asc, eq, gt, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { AppError } from "@/server/errors";
import type { LedgerDiscrepancy } from "./ledger-audit";

/**
 * Bounded, read-only keyset reconciliation for businesses larger than the
 * single-query limit. Every batch is read from one REPEATABLE READ snapshot,
 * so concurrent accruals cannot create a misleading mixed-time report.
 */
export const LEDGER_BATCH_SIZE = 500;
export const MAX_BATCH_LEDGER_CARDS = 50_000;
export const MAX_BATCH_LEDGER_SAMPLES = 50;

export type BatchedLedgerAudit = {
  companyId: string;
  cardsChecked: number;
  discrepancyCount: number;
  discrepancies: LedgerDiscrepancy[];
  sampleTruncated: boolean;
  consistentSnapshot: true;
};

export function assertBatchLedgerCapacity(cardsChecked: number): void {
  if (!Number.isSafeInteger(cardsChecked) || cardsChecked < 0)
    throw new RangeError("Invalid card count in batched ledger reconciliation");
  if (cardsChecked > MAX_BATCH_LEDGER_CARDS)
    throw new AppError(
      "AUDIT_TOO_LARGE",
      "Слишком много карт для этой проверки. Требуется отдельная фоновая сверка.",
      413,
    );
}

export async function auditCompanyLedgerBatched(companyId: string): Promise<BatchedLedgerAudit> {
  if (typeof companyId !== "string" || !companyId)
    throw new TypeError("companyId is required");

  return db.transaction(async (tx): Promise<BatchedLedgerAudit> => {
    let cursor: string | undefined;
    let cardsChecked = 0;
    let discrepancyCount = 0;
    const discrepancies: LedgerDiscrepancy[] = [];

    while (true) {
      const page = await tx.select({ id: schema.cards.id })
        .from(schema.cards)
        .where(and(
          eq(schema.cards.companyId, companyId),
          cursor ? gt(schema.cards.id, cursor) : undefined,
        ))
        .orderBy(asc(schema.cards.id))
        .limit(LEDGER_BATCH_SIZE);

      if (page.length === 0) break;
      assertBatchLedgerCapacity(cardsChecked + page.length);

      const totals = await tx.select({
        cardId: schema.cards.id,
        storedBalance: schema.cards.balance,
        ledgerTotal: sql<string>`COALESCE(SUM(${schema.transactions.amount}), 0)::text`,
        foreignTenantCount: sql<string>`COUNT(*) FILTER (WHERE ${schema.transactions.companyId} <> ${schema.cards.companyId})::text`,
      })
        .from(schema.cards)
        .leftJoin(schema.transactions, eq(schema.transactions.cardId, schema.cards.id))
        .where(and(
          eq(schema.cards.companyId, companyId),
          inArray(schema.cards.id, page.map((card) => card.id)),
        ))
        .groupBy(schema.cards.id, schema.cards.balance);

      // Never claim a complete audit if a page unexpectedly disappeared.
      if (totals.length !== page.length)
        throw new Error("Inconsistent ledger batch within database snapshot");

      for (const item of totals) {
        const ledgerBalance = Number(item.ledgerTotal);
        const foreignTenantTransactions = Number(item.foreignTenantCount);
        if (!Number.isSafeInteger(ledgerBalance) || !Number.isSafeInteger(foreignTenantTransactions))
          throw new RangeError("Ledger audit result outside safe integer range");

        if (item.storedBalance !== ledgerBalance ||
            foreignTenantTransactions > 0 ||
            item.storedBalance < 0) {
          discrepancyCount++;
          if (discrepancies.length < MAX_BATCH_LEDGER_SAMPLES) {
            discrepancies.push({
              cardId: item.cardId,
              storedBalance: item.storedBalance,
              ledgerBalance,
              foreignTenantTransactions,
            });
          }
        }
      }
      cardsChecked += page.length;
      cursor = page[page.length - 1].id;
    }

    return {
      companyId, cardsChecked, discrepancyCount, discrepancies,
      sampleTruncated: discrepancyCount > discrepancies.length,
      consistentSnapshot: true,
    };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}
