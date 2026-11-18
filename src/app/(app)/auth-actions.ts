"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionState } from "@/components/app/action-types";
import { UiError, guard, optText, parseForm, str } from "@/components/app/action-utils";
import { REF_COOKIE } from "@/components/app/data";
import { safeNext } from "@/components/app/safe";
import { createSession, destroySession, requireUser } from "@/server/auth/session";
import { deleteUserData, loginUser, registerUser } from "@/server/auth/service";
import { getClientIp, rateLimit } from "@/server/security/rateLimit";

const email = z.string().trim().toLowerCase().pipe(z.email("Введите корректный email"));

const loginSchema = z.object({
  email,
  password: z.string().min(1, "Введите пароль").max(200),
  next: z.string().optional(),
});

const registerSchema = z.object({
  email,
  password: z.string().min(8, "Пароль — не менее 8 символов").max(200, "Слишком длинный пароль"),
  name: z.string().optional().transform(optText(80)),
  country: z.enum(["RU", "BY"], { message: "Выберите страну" }),
  role: z.enum(["business", "customer"]).catch("customer"),
  acceptTerms: z.string().optional().refine((v) => v === "on", { message: "Нужно принять Условия использования" }),
  acceptPd: z.string().optional().refine((v) => v === "on", { message: "Нужно дать согласие на обработку персональных данных" }),
  ref: z.string().optional().transform((v) => (v && /^[\w-]{4,64}$/.test(v) ? v : undefined)),
  invite: z.string().optional().transform((v) => (v && /^[\w-]{4,64}$/.test(v) ? v : undefined)),
  next: z.string().optional(),
});

async function limitByIp(scope: string, limit: number, windowSec: number) {
  const ip = await getClientIp();
  const rl = await rateLimit(`${scope}:${ip}`, limit, windowSec);
  if (!rl.ok) throw new UiError(`Слишком много попыток. Повторите через ${Math.max(1, Math.ceil(rl.retryAfter))} с.`);
}

export async function loginAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const r = await guard(async () => {
    await limitByIp("login", 10, 300);
    const v = parseForm(loginSchema, fd);
    const user = await loginUser(v.email, v.password);
    await createSession(user.id);
    return v;
  });
  if (!r.ok) return { error: r.error };
  redirect(safeNext(r.data.next, "/app"));
}

export async function registerAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const r = await guard(async () => {
    await limitByIp("register", 8, 3600);
    const v = parseForm(registerSchema, fd);
    const user = await registerUser({
      email: v.email,
      password: v.password,
      name: v.name,
      country: v.country,
      acceptTerms: true,
      acceptPd: true,
      invitedByCode: v.invite,
    });
    await createSession(user.id);
    if (v.role === "business" && v.ref) {
      const jar = await cookies();
      jar.set(REF_COOKIE, v.ref, { httpOnly: true, sameSite: "lax", path: "/", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 30 });
    }
    return v;
  });
  if (!r.ok) return { error: r.error };
  if (r.data.role === "business") redirect("/app/onboarding");
  redirect(safeNext(r.data.next, "/me"));
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}

export async function deleteAccountAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const r = await guard(async () => {
    const user = await requireUser();
    if (str(fd, "confirm").trim().toUpperCase() !== "УДАЛИТЬ") {
      throw new UiError("Для подтверждения введите слово УДАЛИТЬ");
    }
    await deleteUserData(user.id);
    await destroySession();
  });
  if (!r.ok) return { error: r.error };
  redirect("/");
}
