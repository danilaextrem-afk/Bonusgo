import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/server/db";
import { AppError } from "@/server/errors";

export const CUSTOMER_HISTORY_PAGE_SIZE = 20;

type HistoryCursor = { at: string; id: string };
const EXACT_UTC = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{6}Z$/;
const SAFE_ID = /^[a-zA-Z0-9_-]{22}$/;

export function encodeCustomerHistoryCursor(cursor: HistoryCursor): string {
  return Buffer.from(cursor.at + "|" + cursor.id, "utf8").toString("base64url");
}

export function parseCustomerHistoryCursor(value: string | undefined): HistoryCursor | null {
  if (value === undefined || value === "") return null;
  if (typeof value !== "string" || value.length > 160 || !/^[\w-]+$/.test(value))
    throw new AppError("VALIDATION", "Недействительная ссылка на страницу истории.");
  let decoded: string;
  try {
    decoded = Buffer.from(value, "base64url").toString("utf8");
    if (Buffer.from(decoded, "utf8").toString("base64url") !== value)
      throw new Error("Invalid cursor encoding");
  } catch {
    throw new AppError("VALIDATION", "Недействительная ссылка на страницу истории.");
  }
  const parts = decoded.split("|");
  if (parts.length !== 2 || !EXACT_UTC.test(parts[0]) || !SAFE_ID.test(parts[1]) ||
      !Number.isFinite(Date.parse(parts[0])))
    throw new AppError("VALIDATION", "Недействительная ссылка на страницу истории.");
  const date = new Date(parts[0]);
  if (date.toISOString().slice(0, 19) !== parts[0].slice(0, 19))
    throw new AppError("VALIDATION", "Недействительная ссылка на страницу истории.");
  return { at: parts[0], id: parts[1] };
}

export type CustomerHistoryItem = {
  id: string;
  type: "ACCRUE" | "REDEEM" | "ADJUST" | "REFERRAL_BONUS";
  amount: number;
  createdAt: Date;
  programName: string;
  companyName: string;
};

export async function listCustomerHistory(userId: string, cursorText?: string): Promise<{
  items: CustomerHistoryItem[];
  nextCursor: string | null;
}> {
  const cursor = parseCustomerHistoryCursor(cursorText);
  // Preserve PostgreSQL microseconds in the cursor. JS Date only has
  // millisecond precision, so Date.toISOString() would skip tied records.
  const result = await db.execute(sql`
    SELECT t.id, t.type, t.amount, t.created_at, p.name AS program_name,
      co.name AS company_name,
      to_char(t.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS exact_created_at
    FROM transactions t
    JOIN cards c ON c.id = t.card_id
    JOIN companies co ON co.id = c.company_id
    JOIN programs p ON p.id = c.program_id
    WHERE c.customer_id = ${userId}
      AND t.company_id = c.company_id
      AND p.company_id = c.company_id
      AND co.deleted_at IS NULL
      ${cursor ? sql`AND (t.created_at, t.id) < (${cursor.at}::timestamptz, ${cursor.id})` : sql``}
    ORDER BY t.created_at DESC, t.id DESC
    LIMIT ${CUSTOMER_HISTORY_PAGE_SIZE + 1}
  `);

  const rows = result.rows as {
    id: string; type: CustomerHistoryItem["type"]; amount: number;
    created_at: Date | string; program_name: string;
    company_name: string; exact_created_at: string;
  }[];
  const visible = rows.slice(0, CUSTOMER_HISTORY_PAGE_SIZE);
  return {
    items: visible.map((r) => ({
      id: r.id, type: r.type, amount: Number(r.amount),
      createdAt: new Date(r.created_at), programName: r.program_name,
      companyName: r.company_name,
    })),
    nextCursor: rows.length > CUSTOMER_HISTORY_PAGE_SIZE
      ? encodeCustomerHistoryCursor({
          at: visible[visible.length - 1].exact_created_at,
          id: visible[visible.length - 1].id,
        })
      : null,
  };
}
