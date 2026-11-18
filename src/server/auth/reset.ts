import { unwrapTx } from "@/server/ydb/errors";
import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { audit } from "@/server/audit";
import { createId } from "@/server/id";
import { ydb } from "@/server/ydb/client";
import { camel, type User } from "@/server/ydb/rows";
import { nowSec } from "@/server/ydb/values";
import { emailConfigured, sendEmail } from "@/server/email";
import { AppError } from "@/server/errors";
import { getClientIp, rateLimit } from "@/server/security/rateLimit";
import { hashPassword } from "./password";

const TTL_MIN = 30;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const appUrl = (p: string) => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "") + p;

/** `sql.begin` wraps non-retryable errors (incl. our AppErrors) as Error("Transaction failed.", { cause }): unwrap. */

export const passwordResetAvailable = emailConfigured;

/**
 * Sends a reset link if the account exists. The response never reveals whether it does
 * (no account enumeration). Rate-limited per IP and per email.
 */
export async function requestPasswordReset(rawEmail: string): Promise<void> {
  const email = String(rawEmail ?? "").trim().toLowerCase().slice(0, 254);
  const ip = await getClientIp();
  const [byIp, byEmail] = [await rateLimit(`reset-ip:${ip}`, 10, 3600), await rateLimit(`reset-email:${email}`, 3, 3600)];
  if (!byIp.ok) throw new AppError("RATE_LIMITED", "Слишком много запросов. Попробуйте позже.", 429);
  if (!byEmail.ok) return; // silently drop: same response as success
  if (!emailConfigured()) throw new AppError("EMAIL_UNAVAILABLE", "Восстановление по почте пока не подключено. Напишите в поддержку.", 503);
  const sql = await ydb();
  const [[ref]] = await sql<[{ user_id: string | null }]>`SELECT user_id FROM users_by_email WHERE email = ${email}`;
  if (!ref?.user_id) return;
  const [[row]] = await sql<[Record<string, unknown>]>`SELECT * FROM users WHERE id = ${ref.user_id}`;
  const user = row ? camel<User>(row) : null;
  if (!user || user.deletedAt) return;
  const token = randomBytes(32).toString("base64url");
  const now = nowSec();
  await sql`INSERT INTO password_resets (token_hash, id, user_id, expires_at, created_at)
            VALUES (${sha256(token)}, ${createId()}, ${user.id}, ${new Date(now.getTime() + TTL_MIN * 60_000)}, ${now})`;
  try {
    await sendEmail(
      user.email,
      "Восстановление пароля QRonus",
      `Здравствуйте!\n\nЧтобы задать новый пароль, откройте ссылку (действует ${TTL_MIN} минут):\n${appUrl(`/reset/${token}`)}\n\nЕсли вы не запрашивали восстановление, просто проигнорируйте это письмо.\n\nQRonus`,
    );
    await audit("auth.reset_requested", { actorUserId: user.id });
  } catch (e) {
    await audit("error.reset_email_failed", { actorUserId: user.id, meta: { message: e instanceof Error ? e.message : String(e) } });
  }
}

/** Consumes the one-time token atomically, sets the new password and signs out all sessions. */
export async function resetPassword(token: string, newPassword: string): Promise<void> {
  if (typeof newPassword !== "string" || newPassword.length < 8 || newPassword.length > 200) throw new AppError("VALIDATION", "Пароль — не менее 8 символов.");
  if (typeof token !== "string" || token.length < 20 || token.length > 100) throw new AppError("INVALID_TOKEN", "Ссылка недействительна или устарела. Запросите новую.");
  const passwordHash = await hashPassword(newPassword);
  const sql = await ydb();
  const invalid = () => new AppError("INVALID_TOKEN", "Ссылка недействительна или устарела. Запросите новую.");
  const userId = await sql.begin(async (tx) => {
    const now = nowSec();
    const [[row]] = await tx<[{ user_id: string | null; used_at: Date | null; expires_at: Date | null }]>`
      SELECT user_id, used_at, expires_at FROM password_resets WHERE token_hash = ${sha256(token)}`;
    if (!row?.user_id || row.used_at || !row.expires_at || new Date(row.expires_at).getTime() <= Date.now()) throw invalid();
    const uid = row.user_id;
    await tx`UPDATE users SET password_hash = ${passwordHash} WHERE id = ${uid}`;
    await tx`DELETE FROM sessions WHERE user_id = ${uid}`;
    // Marks this link used; other outstanding links for this user stop working too.
    await tx`UPDATE password_resets SET used_at = ${now} WHERE user_id = ${uid} AND used_at IS NULL`;
    return uid;
  }).catch((e) => {
    throw unwrapTx(e);
  });
  await audit("auth.password_reset", { actorUserId: userId });
}
