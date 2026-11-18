import bcrypt from "bcryptjs";
import { AppError } from "@/server/errors";

export const BCRYPT_COST = 12;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 200;

export async function hashPassword(password: string): Promise<string> {
  if (typeof password !== "string" || password.length < PASSWORD_MIN) {
    throw new AppError("WEAK_PASSWORD", `Пароль — не менее ${PASSWORD_MIN} символов.`);
  }
  if (password.length > PASSWORD_MAX) throw new AppError("WEAK_PASSWORD", "Слишком длинный пароль.");
  return bcrypt.hash(password, BCRYPT_COST);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (typeof password !== "string" || typeof hash !== "string" || !hash) return false;
  try {
    return await bcrypt.compare(password, hash);
  } catch {
    return false;
  }
}
