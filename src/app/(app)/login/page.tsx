import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/app/ActionForm";
import { SubmitButton } from "@/components/app/SubmitButton";
import { Field, Notice } from "@/components/app/ui";
import { safeNext, isDemoMode } from "@/components/app/safe";
import { sp1 } from "@/components/app/data";
import { getCurrentUser } from "@/server/auth/session";
import { loginAction } from "../auth-actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Вход", robots: { index: false, follow: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const next = safeNext(sp1(sp.next), "");
  const user = await getCurrentUser();
  if (user) redirect(next || "/app");
  const qs = next ? `&next=${encodeURIComponent(next)}` : "";
  return (
    <main className="container-x flex min-h-dvh max-w-md flex-col justify-center py-10">
      <Link href="/" className="mb-6 inline-flex min-h-10 items-center self-start text-2xl font-extrabold tracking-tight"><span className="glow-text">QR</span>onus</Link>
      <div className="card">
        <h1 className="mb-4 text-xl font-bold">Вход</h1>
        {isDemoMode() && <div className="mb-4"><Notice tone="warn">Тестовый режим: не вводите реальные персональные данные</Notice></div>}
        <ActionForm action={loginAction} className="space-y-4">
          <input type="hidden" name="next" value={next} />
          <Field label="Email"><input className="input" type="email" name="email" autoComplete="email" required /></Field>
          <Field label="Пароль"><input className="input" type="password" name="password" autoComplete="current-password" required /></Field>
          <SubmitButton className="btn-primary w-full">Войти</SubmitButton>
        </ActionForm>
        <p className="mt-3 text-right text-sm"><Link className="inline-flex min-h-10 items-center text-muted underline underline-offset-4 hover:text-neon" href="/reset">Забыли пароль?</Link></p>
      </div>
      <p className="mt-4 text-center text-sm text-muted">
        Нет аккаунта? <Link className="inline-flex min-h-10 items-center text-neon underline underline-offset-4" href={`/register?role=customer${qs}`}>Я клиент</Link> ·{" "}
        <Link className="inline-flex min-h-10 items-center text-neon underline underline-offset-4" href="/register?role=business">Я бизнес</Link>
      </p>
    </main>
  );
}
