import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { getCurrentUser } from "@/server/auth/session";
import { audit } from "@/server/audit";
import { AppError, ForbiddenError, NotFoundError } from "@/server/errors";
import { rateLimit } from "@/server/security/rateLimit";
import { auditCompanyLedger, type CompanyLedgerAudit } from "./ledger-audit";
import { auditCompanyLedgerBatched, type BatchedLedgerAudit } from "./batched-ledger-audit";

/**
 * Privileged internal diagnostic. Authentication is checked at the service
 * boundary, not only in the rendering page. The production database ADMIN
 * role is mandatory even when local test/admin email overrides are enabled.
 * No balances are changed.
 */
export async function runAdminLedgerAudit(
  companyId: string,
  mode: "standard" | "batched" = "standard",
): Promise<CompanyLedgerAudit | BatchedLedgerAudit> {
  const user = await getCurrentUser();
  if (!user || user.platformRole !== "ADMIN")
    throw new ForbiddenError("Недостаточно прав для сверки бонусных балансов.");

  if (!/^[A-Za-z0-9_-]{22}$/.test(companyId))
    throw new AppError("VALIDATION", "Укажите корректный идентификатор компании.");

  const limit = await rateLimit(`admin-ledger:${user.id}`, 5, 60);
  if (!limit.ok)
    throw new AppError("RATE_LIMITED", "Слишком много проверок. Повторите через минуту.", 429);

  const company = (await db.select({ id: schema.companies.id })
    .from(schema.companies)
    .where(and(eq(schema.companies.id, companyId), isNull(schema.companies.deletedAt)))
    .limit(1))[0];
  if (!company) throw new NotFoundError("Компания не найдена.");

  if (mode !== "standard" && mode !== "batched")
    throw new AppError("VALIDATION", "Неизвестный режим сверки.");

  const report = mode === "batched"
    ? await auditCompanyLedgerBatched(company.id)
    : await auditCompanyLedger(company.id);
  const discrepancyCount = "discrepancyCount" in report
    ? report.discrepancyCount
    : report.discrepancies.length;
  // Store only summary counts, never customer details, card identifiers or tokens.
  await audit(discrepancyCount > 0 ? "loyalty.ledger.mismatch" : "loyalty.ledger.checked", {
    actorUserId: user.id,
    companyId: company.id,
    meta: { cardsChecked: report.cardsChecked, discrepancyCount, mode },
  });
  return report;
}
