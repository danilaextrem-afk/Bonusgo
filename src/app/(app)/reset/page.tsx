import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/app/ActionForm";
import { SubmitButton } from "@/components/app/SubmitButton";
import { Field, Notice } from "@/components/app/ui";
import { passwordResetAvailable } from "@/server/auth/reset";
import { requestResetAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Восстановление пароля", robots: { index: false, follow: false } };

export default function ResetRequestPage() {
  const available = passwordResetAvailable();
  return (
    <main className="container-x flex min-h-dvh max-w-md flex-col justify-center py-10">
      <Link href="/" className="mb-6 inline-flex min-h-10 items-center self-start text-2xl font-extrabold tracking-tight"><span className="glow-text">QR</span>onus</Link>
      <div className="card">
        <h1 className="mb-2 text-xl font-bold">Восстановление пароля</h1>
        {available ? (
          <>
            <p className="mb-4 text-sm text-muted">Укажите email аккаунта — пришлём ссылку для нового пароля.</p>
            <ActionForm action={requestResetAction} className="space-y-4">
              <Field label="Email"><input className="input" type="email" name="email" autoComplete="email" required /></Field>
              <SubmitButton className="btn-primary w-full">Отправить ссылку</SubmitButton>
            </ActionForm>
          </>
        ) : (
          <Notice tone="warn">Восстановление по почте скоро появится. Пока напишите нам со страницы «Контакты» — поможем вернуть доступ.</Notice>
        )}
      </div>
      <p className="mt-4 text-center text-sm text-muted"><Link className="inline-flex min-h-10 items-center text-neon underline underline-offset-4" href="/login">Вернуться ко входу</Link></p>
    </main>
  );
}
