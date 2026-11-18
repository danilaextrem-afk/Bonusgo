"use server";
import { z } from "zod";
import type { ActionState } from "@/components/app/action-types";
import { guard, parseForm } from "@/components/app/action-utils";
import { requestPasswordReset, resetPassword } from "@/server/auth/reset";

const SENT = "Если такой аккаунт есть, мы отправили письмо со ссылкой. Проверьте почту и папку «Спам».";

export async function requestResetAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const r = await guard(async () => {
    const { email } = parseForm(z.object({ email: z.string().trim().toLowerCase().pipe(z.email("Введите корректный email")) }), fd);
    await requestPasswordReset(email);
  });
  return r.ok ? { ok: SENT } : { error: r.error };
}

export async function resetPasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const r = await guard(async () => {
    const v = parseForm(
      z.object({ token: z.string().min(20).max(100), password: z.string().min(8, "Пароль — не менее 8 символов").max(200), confirm: z.string() })
        .refine((x) => x.password === x.confirm, { message: "Пароли не совпадают" }),
      fd,
    );
    await resetPassword(v.token, v.password);
  });
  return r.ok ? { ok: "Пароль изменён. Теперь войдите с новым паролем." } : { error: r.error };
}
