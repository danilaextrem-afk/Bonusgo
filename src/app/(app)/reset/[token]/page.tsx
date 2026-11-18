import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/app/ActionForm";
import { SubmitButton } from "@/components/app/SubmitButton";
import { Field } from "@/components/app/ui";
import { resetPasswordAction } from "../actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Новый пароль", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function ResetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <main className="container-x flex min-h-dvh max-w-md flex-col justify-center py-10">
      <Link href="/" className="mb-6 text-2xl font-extrabold tracking-tight"><span className="glow-text">QR</span>onus</Link>
      <div className="card">
        <h1 className="mb-4 text-xl font-bold">Новый пароль</h1>
        <ActionForm action={resetPasswordAction} className="space-y-4">
          <input type="hidden" name="token" value={token} />
          <Field label="Новый пароль"><input className="input" type="password" name="password" autoComplete="new-password" minLength={8} required /></Field>
          <Field label="Повторите пароль"><input className="input" type="password" name="confirm" autoComplete="new-password" minLength={8} required /></Field>
          <SubmitButton className="btn-primary w-full">Сохранить пароль</SubmitButton>
        </ActionForm>
      </div>
      <p className="mt-4 text-center text-sm text-muted"><Link className="text-neon underline underline-offset-4" href="/login">Перейти ко входу</Link></p>
    </main>
  );
}
