import "server-only";
import { randomBytes } from "node:crypto";
import { formatMajor } from "./types";

/**
 * Receipts for НПД (самозанятый) via the owner's own "Мой налог" web cabinet (lknpd.nalog.ru).
 * NOTE: this is the API used by the official web cabinet, not a public partner API — FNS may change it.
 * Credentials come only from env (NALOG_INN, NALOG_PASSWORD), never from code or the database.
 */
const BASE = process.env.NALOG_API_URL ?? "https://lknpd.nalog.ru/api/v1";

export function npdConfigured(): boolean {
  return Boolean(process.env.NALOG_INN && process.env.NALOG_PASSWORD);
}

export type IncomeClient =
  | { type: "FROM_INDIVIDUAL"; displayName?: string }
  | { type: "FROM_LEGAL_ENTITY"; inn: string; displayName: string };

export interface ReceiptInput {
  serviceName: string;
  amountMinor: number;
  operationTime: Date;
  client: IncomeClient;
}

/** "2026-11-18T22:05:00+03:00" — the cabinet expects local time with an explicit offset (Moscow). */
export function moscowIso(d: Date): string {
  const msk = new Date(d.getTime() + 3 * 3600_000);
  return msk.toISOString().replace(/\.\d{3}Z$/, "+03:00");
}

export function buildIncomeBody(input: ReceiptInput, now = new Date()) {
  const c = input.client;
  return {
    operationTime: moscowIso(input.operationTime),
    requestTime: moscowIso(now),
    services: [{ name: input.serviceName.slice(0, 256), amount: Number(formatMajor(input.amountMinor)), quantity: 1 }],
    totalAmount: formatMajor(input.amountMinor),
    client:
      c.type === "FROM_LEGAL_ENTITY"
        ? { contactPhone: null, displayName: c.displayName.slice(0, 256), inn: c.inn, incomeType: "FROM_LEGAL_ENTITY" }
        : { contactPhone: null, displayName: c.displayName ?? null, inn: null, incomeType: "FROM_INDIVIDUAL" },
    paymentType: "ACCOUNT",
    ignoreMaxTotalIncomeRestriction: false,
  };
}

async function call<T>(path: string, body: unknown, token?: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Мой налог ${path}: HTTP ${res.status} ${text.slice(0, 200)}`);
  return JSON.parse(text) as T;
}

let cached: { token: string; until: number } | null = null;

async function login(): Promise<string> {
  if (cached && cached.until > Date.now()) return cached.token;
  const deviceId = process.env.NALOG_DEVICE_ID ?? randomBytes(10).toString("hex");
  const r = await call<{ token: string; tokenExpireIn?: string }>("/auth/lkfl", {
    username: process.env.NALOG_INN,
    password: process.env.NALOG_PASSWORD,
    deviceInfo: { sourceDeviceId: deviceId, sourceType: "WEB", appVersion: "1.0.0", metaDetails: { userAgent: "BONUSGO" } },
  });
  const until = r.tokenExpireIn ? new Date(r.tokenExpireIn).getTime() - 60_000 : Date.now() + 30 * 60_000;
  cached = { token: r.token, until };
  return r.token;
}

/** Issues the receipt and returns its UUID. Throws on any failure (caller records the error). */
export async function issueReceipt(input: ReceiptInput): Promise<string> {
  if (!npdConfigured()) throw new Error("Автоматические чеки не настроены (NALOG_INN / NALOG_PASSWORD)");
  const token = await login();
  const r = await call<{ approvedReceiptUuid: string }>("/income", buildIncomeBody(input), token);
  if (!r.approvedReceiptUuid) throw new Error("Мой налог не вернул номер чека");
  return r.approvedReceiptUuid;
}

export function receiptUrl(uuid: string): string {
  return `${BASE}/receipt/${process.env.NALOG_INN}/${encodeURIComponent(uuid)}/print`;
}
