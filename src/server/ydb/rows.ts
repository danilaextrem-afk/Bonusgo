import type * as s from "@/server/schema";

/**
 * Row types stay the Drizzle-inferred camelCase types from src/server/schema.ts (used only as a
 * type source now). YDB returns snake_case columns; `camel()` maps them generically.
 */
export type User = typeof s.users.$inferSelect;
export type Session = typeof s.sessions.$inferSelect;
export type Company = typeof s.companies.$inferSelect;
export type Membership = typeof s.memberships.$inferSelect;
export type Venue = typeof s.venues.$inferSelect;
export type Program = typeof s.programs.$inferSelect;
export type Reward = typeof s.rewards.$inferSelect;
export type Card = typeof s.cards.$inferSelect;
export type Transaction = typeof s.transactions.$inferSelect;
export type Subscription = typeof s.subscriptions.$inferSelect;
export type Payment = typeof s.payments.$inferSelect;
export type PaymentEvent = typeof s.paymentEvents.$inferSelect;
export type Referral = typeof s.referrals.$inferSelect;
export type AuditLog = typeof s.auditLogs.$inferSelect;

const toCamel = (k: string) => k.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());

/** snake_case row → camelCase object; bigint → number; JSON documents parsed; null stays null. */
export function camel<T>(row: Record<string, unknown> | undefined | null): T {
  if (!row) return row as T;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    let val: unknown = v;
    if (typeof v === "bigint") val = Number(v);
    else if (v instanceof Date) val = v;
    out[toCamel(k)] = val;
  }
  return out as T;
}
export const camelAll = <T>(rows: Record<string, unknown>[] | undefined): T[] => (rows ?? []).map((r) => camel<T>(r));
