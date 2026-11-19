import { AppError } from "@/server/errors";

/**
 * Calendar windows in UTC. Half-open [from, until) boundaries guarantee
 * adjacent month/day exports do not overlap or skip a timestamp.
 */
export type ExportPeriod = { label: string; from: Date; until: Date };

export function parseExportPeriod(value: string | null | undefined): ExportPeriod | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw new AppError("VALIDATION", "Некорректный период выгрузки.");

  const match = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(value);
  if (!match) throw new AppError("VALIDATION", "Выберите месяц или дату в формате ГГГГ-ММ[-ДД].");

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = match[3] === undefined ? null : Number(match[3]);
  if (year < 2000 || year > 9998 || month < 1 || month > 12)
    throw new AppError("VALIDATION", "Период выгрузки выходит за допустимые границы.");

  const from = new Date(Date.UTC(year, month - 1, day ?? 1));
  if (day !== null && (day < 1 || from.toISOString().slice(0, 10) !== value))
    throw new AppError("VALIDATION", "Укажите существующую календарную дату.");

  const until = day === null
    ? new Date(Date.UTC(year, month, 1))
    : new Date(Date.UTC(year, month - 1, day + 1));

  return { label: value, from, until };
}
