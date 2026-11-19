import { AppError } from "@/server/errors";

/** Maximum number of rows returned by one synchronous CSV download. */
export const MAX_EXPORT_ROWS = 50_000;

/**
 * A truncated export must not be presented as a complete accounting record.
 * Query one sentinel row beyond the limit, then fail closed.
 */
export function assertCompleteExport(rowCount: number): void {
  if (!Number.isSafeInteger(rowCount) || rowCount < 0)
    throw new RangeError("Invalid CSV export row count");
  if (rowCount > MAX_EXPORT_ROWS)
    throw new AppError(
      "EXPORT_TOO_LARGE",
      "Слишком много записей для одного CSV. Обратитесь в поддержку для пакетной выгрузки.",
      413,
    );
}
