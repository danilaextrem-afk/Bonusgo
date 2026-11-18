"use server";
import { qrData, type QrData } from "@/components/app/qr";
import { requireUser } from "@/server/auth/session";
import { issueCustomerToken } from "@/server/loyalty/service";
import { getClientIp, rateLimit } from "@/server/security/rateLimit";

export interface QrPayload {
  qr: QrData;
  expiresAt: number;
  /** Only in PAYMENTS_TEST_MODE (E2E): lets tests read the token. Never set in real production. */
  token?: string;
}

/** Issues a fresh one-time token and returns the QR geometry (the raw token is never rendered as text). */
export async function refreshQrAction(): Promise<QrPayload | { error: string }> {
  const user = await requireUser();
  const rl = await rateLimit(`qr:${user.id}:${await getClientIp()}`, 30, 600);
  if (!rl.ok) return { error: "Слишком часто. Подождите немного." };
  const { token, expiresAt } = await issueCustomerToken(user.id);
  return { qr: qrData(`BG1.${token}`), expiresAt: new Date(expiresAt).getTime(), ...(process.env.PAYMENTS_TEST_MODE === "true" ? { token: `BG1.${token}` } : {}) };
}
