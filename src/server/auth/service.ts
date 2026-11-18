import "server-only";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/server/db";
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

function isUniqueViolation(e: unknown): boolean {
  const err = e as { code?: string; cause?: { code?: string } };
  return err?.code === "23505" || err?.cause?.code === "23505";
}

export async function registerUser(input: {
  email: string; password: string; name?: string; country: "RU" | "BY"; acceptTerms: boolean; acceptPd: boolean; invitedByCode?: string;
}): Promise<User> {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) throw new AppError("VALIDATION", parsed.error.issues[0]?.message ?? "Проверьте введённые данные.");
  const v = parsed.data;
  const existing = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, v.email)).limit(1);
  if (existing[0]) throw new AppError("EMAIL_TAKEN", "Этот email уже зарегистрирован. Войдите в аккаунт.", 409);
  const passwordHash = await hashPassword(v.password);
  try {
    const user = await db.transaction(async (tx) => {
      const [u] = await tx
        .insert(schema.users)
        .values({ email: v.email, passwordHash, name: v.name ?? null, country: v.country, invitedByCode: v.invitedByCode ?? null })
        .returning();
      await tx.insert(schema.consents).values([
        { userId: u.id, type: "terms", version: CONSENT_VERSION },
        { userId: u.id, type: "pd_processing", version: CONSENT_VERSION },
      ]);
      return u;
    });
    await audit("user.register", { actorUserId: user.id, meta: { country: v.country } });
    return user;
  } catch (e) {
    if (isUniqueViolation(e)) throw new AppError("EMAIL_TAKEN", "Этот email уже зарегистрирован. Войдите в аккаунт.", 409);
    throw e;
  }
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
  const rows = await db.select().from(schema.users).where(eq(schema.users.email, normalized)).limit(1);
  const user = rows[0];
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
  await db.transaction(async (tx) => {
    await tx
      .update(schema.users)
      .set({ email: `deleted-${userId}@deleted.invalid`, name: null, phone: null, passwordHash: randomHash, deletedAt: new Date() })
      .where(eq(schema.users.id, userId));
    await tx.delete(schema.sessions).where(eq(schema.sessions.userId, userId));
    await tx.delete(schema.customerTokens).where(eq(schema.customerTokens.userId, userId));
  });
  await audit("user.delete_data", { actorUserId: userId });
}
