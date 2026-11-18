import "server-only";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { createId } from "@/server/id";
import { ydb } from "@/server/ydb/client";
import { isDuplicate } from "@/server/ydb/errors";
import { camel } from "@/server/ydb/rows";
import { nowSec, optDate, optText } from "@/server/ydb/values";
import { AppError, AuthError } from "@/server/errors";
import { audit } from "@/server/audit";
import { getClientIp, rateLimit } from "@/server/security/rateLimit";
import { hashPassword, verifyPassword } from "./password";
import type { User } from "./session";

export const CONSENT_VERSION = "2026-11";
// Pre-computed bcrypt hash (cost 12) used to equalize timing when the user does not exist.
const DUMMY_HASH = "$2b$12$N9h1TivGxIEYNnrQfTQXMu66njFhgME/EDYRHW7qwGvXL/V3pY4iO";

const registerSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("Введите корректный email")).pipe(z.string().max(254)),
  password: z.string().min(8, "Пароль — не менее 8 символов").max(200, "Слишком длинный пароль"),
  name: z.string().trim().max(80).optional().transform((v) => (v ? v : undefined)),
  country: z.enum(["RU", "BY"], { message: "Выберите страну" }),
  acceptTerms: z.literal(true, { message: "Нужно принять Условия использования" }),
  acceptPd: z.literal(true, { message: "Нужно дать согласие на обработку персональных данных" }),
  invitedByCode: z.string().trim().max(64).optional(),
});

/** `sql.begin` wraps non-retryable errors (incl. our AppErrors) as Error("Transaction failed.", { cause }): unwrap. */
const unwrapTx = (e: unknown): unknown => (e instanceof Error && e.message === "Transaction failed." && e.cause !== undefined ? e.cause : e);
const emailTaken = () => new AppError("EMAIL_TAKEN", "Этот email уже зарегистрирован. Войдите в аккаунт.", 409);

/** User (deleted ones included) by email via the users_by_email lookup table. */
async function findUserByEmail(email: string): Promise<User | null> {
  const sql = await ydb();
  const [[ref]] = await sql<[{ user_id: string | null }]>`SELECT user_id FROM users_by_email WHERE email = ${email}`;
  if (!ref?.user_id) return null;
  const [[u]] = await sql<[Record<string, unknown>]>`SELECT * FROM users WHERE id = ${ref.user_id}`;
  return u ? camel<User>(u) : null;
}

export async function registerUser(input: {
  email: string; password: string; name?: string; country: "RU" | "BY"; acceptTerms: boolean; acceptPd: boolean; invitedByCode?: string;
}): Promise<User> {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) throw new AppError("VALIDATION", parsed.error.issues[0]?.message ?? "Проверьте введённые данные.");
  const v = parsed.data;
  if (await findUserByEmail(v.email)) throw emailTaken();
  const passwordHash = await hashPassword(v.password);
  const now = nowSec();
  const user: User = {
    id: createId(), email: v.email, passwordHash, name: v.name ?? null, phone: null, platformRole: "USER", country: v.country,
    inviteCode: createId(), invitedByCode: v.invitedByCode ?? null, createdAt: now, deletedAt: null,
  };
  const sql = await ydb();
  try {
    await sql.begin(async (tx) => {
      // users_by_email PK = email: a concurrent or repeated registration fails here (uniqueness).
      await tx`INSERT INTO users_by_email (email, user_id) VALUES (${user.email}, ${user.id})`;
      await tx`INSERT INTO users (id, email, password_hash, name, phone, platform_role, country, invite_code, invited_by_code, created_at)
               VALUES (${user.id}, ${user.email}, ${passwordHash}, ${optText(user.name)}, ${optText(null)}, ${user.platformRole}, ${user.country},
                       ${user.inviteCode}, ${optText(user.invitedByCode)}, ${now})`;
      await tx`UPSERT INTO consents (id, user_id, type, version, granted_at) VALUES
               (${createId()}, ${user.id}, ${"terms"}, ${CONSENT_VERSION}, ${now}),
               (${createId()}, ${user.id}, ${"pd_processing"}, ${CONSENT_VERSION}, ${now})`;
    });
  } catch (err) {
    const e = unwrapTx(err);
    if (isDuplicate(e)) throw emailTaken();
    throw e;
  }
  await audit("user.register", { actorUserId: user.id, meta: { country: v.country } });
  return user;
}

export async function loginUser(email: string, password: string): Promise<User> {
  const normalized = String(email ?? "").trim().toLowerCase().slice(0, 254);
  // Per email+IP (stops guessing) and a much looser per-email cap (stops distributed guessing),
  // so a stranger can't lock a real owner out just by typing wrong passwords for their email.
  const ip = await getClientIp();
  const perPair = await rateLimit(`login:${normalized}:${ip}`, 10, 15 * 60);
  const perEmail = perPair.ok ? await rateLimit(`login-email:${normalized}`, 100, 15 * 60) : perPair;
  const rl = perPair.ok ? perEmail : perPair;
  if (!rl.ok) throw new AppError("RATE_LIMITED", `Слишком много попыток входа. Повторите через ${Math.ceil(rl.retryAfter / 60)} мин.`, 429);
  const user = await findUserByEmail(normalized);
  if (!user || user.deletedAt) {
    await verifyPassword(String(password ?? ""), DUMMY_HASH);
    throw new AuthError("INVALID_CREDENTIALS", "Неверный email или пароль.");
  }
  const ok = await verifyPassword(String(password ?? ""), user.passwordHash);
  if (!ok) {
    await audit("auth.login_failed", { actorUserId: user.id });
    throw new AuthError("INVALID_CREDENTIALS", "Неверный email или пароль.");
  }
  await audit("auth.login", { actorUserId: user.id });
  return user;
}

/** Anonymizes personal data (152-ФЗ / Закон РБ №99-З). Transactions are kept for accounting. */
export async function deleteUserData(userId: string): Promise<void> {
  const randomHash = await hashPassword(randomBytes(32).toString("base64url"));
  const sql = await ydb();
  await sql.begin(async (tx) => {
    const [[u]] = await tx<[{ email: string | null }]>`SELECT email FROM users WHERE id = ${userId}`;
    if (u?.email) await tx`DELETE FROM users_by_email WHERE email = ${u.email} AND user_id = ${userId}`;
    await tx`UPDATE users SET email = ${`deleted-${userId}@deleted.invalid`}, name = ${optText(null)}, phone = ${optText(null)},
             password_hash = ${randomHash}, deleted_at = ${optDate(nowSec())} WHERE id = ${userId}`;
    await tx`DELETE FROM sessions WHERE user_id = ${userId}`;
    await tx`DELETE FROM customer_tokens WHERE user_id = ${userId}`;
  }).catch((e) => {
    throw unwrapTx(e);
  });
  await audit("user.delete_data", { actorUserId: userId });
}
