import type { schema } from "@/server/db";

export type ProviderId = "robokassa" | "bepaid" | "webpay" | "mock";
export type PaymentRow = typeof schema.payments.$inferSelect;
export type CompanyRow = typeof schema.companies.$inferSelect;
export type NotificationKind = "paid" | "failed" | "refunded";

/** Raw, unparsed request data handed to a provider for verification. */
export interface NotificationInput {
  headers?: Record<string, string | undefined>;
  form?: Record<string, string>;
  json?: unknown;
  query?: Record<string, string>;
  /** Mock only: amount the route read from the DB (the mock link carries no amount). */
  expectedAmountMinor?: number;
}

export interface VerifiedNotification {
  ok: boolean;
  invoiceNo: number;
  amountMinor: number;
  /** Present when the provider reports a currency; checked against the payment row. */
  currency?: "RUB" | "BYN";
  kind: NotificationKind;
  providerRef?: string;
  failReason?: string;
  raw: Record<string, unknown>;
}

export interface PaymentProvider {
  id: ProviderId;
  /** True only when real money can move (credentials present AND live switch on). */
  isLive(): boolean;
  isConfigured(): boolean;
  createCheckout(payment: PaymentRow, company: CompanyRow): Promise<{ redirectUrl: string }> | { redirectUrl: string };
  verifyNotification(input: NotificationInput): VerifiedNotification;
}

export class PaymentError extends Error {
  constructor(message: string, public code = "payment_error") {
    super(message);
    this.name = "PaymentError";
  }
}

export const testModeOn = () => process.env.PAYMENTS_TEST_MODE === "true";
export const appUrl = (path = "") => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "") + path;

/** "990.00" -> 99000. Strict decimal parse, no floats. Returns NaN on garbage. */
export function parseMinor(s: string): number {
  const m = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(s.trim());
  if (!m) return NaN;
  return Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0") || 0);
}
export const formatMajor = (minor: number) => `${Math.floor(minor / 100)}.${String(minor % 100).padStart(2, "0")}`;
