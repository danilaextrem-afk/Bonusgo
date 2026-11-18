import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { audit } from "@/server/audit";
import { db, schema } from "@/server/db";
import { emailConfigured, sendEmail } from "@/server/email";
import { AppError } from "@/server/errors";
import { getClientIp, rateLimit } from "@/server/security/rateLimit";
import { hashPassword } from "./password";

const TTL_MIN = 30;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const appUrl = (p: string) => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "") + p;

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
  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
  if (!user || user.deletedAt) return;
  const token = randomBytes(32).toString("base64url");
  await db.insert(schema.passwordResets).values({ userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + TTL_MIN * 60_000) });
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
  const userId = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(schema.passwordResets)
      .set({ usedAt: new Date() })
      .where(and(eq(schema.passwordResets.tokenHash, sha256(token)), isNull(schema.passwordResets.usedAt), gt(schema.passwordResets.expiresAt, new Date())))
      .returning({ userId: schema.passwordResets.userId });
    if (!row) throw new AppError("INVALID_TOKEN", "Ссылка недействительна или устарела. Запросите новую.");
    await tx.update(schema.users).set({ passwordHash }).where(eq(schema.users.id, row.userId));
    await tx.delete(schema.sessions).where(eq(schema.sessions.userId, row.userId));
    // Other outstanding links for this user stop working too.
    await tx.update(schema.passwordResets).set({ usedAt: new Date() }).where(and(eq(schema.passwordResets.userId, row.userId), isNull(schema.passwordResets.usedAt)));
    return row.userId;
  });
  await audit("auth.password_reset", { actorUserId: userId });
}
