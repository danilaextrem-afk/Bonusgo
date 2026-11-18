import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/app/ActionForm";
import { SubmitButton } from "@/components/app/SubmitButton";
import { Field, Notice } from "@/components/app/ui";
import { isDemoMode, safeNext } from "@/components/app/safe";
import { sp1 } from "@/components/app/data";
import { getCurrentUser } from "@/server/auth/session";
import { registerAction } from "../auth-actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Регистрация", robots: { index: false, follow: false } };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const role = sp1(sp.role) === "business" ? "business" : "customer";
  const country = sp1(sp.country) === "BY" ? "BY" : "RU";
  const ref = sp1(sp.ref) ?? "";
  const invite = sp1(sp.invite) ?? "";
  const next = safeNext(sp1(sp.next), "");
  const user = await getCurrentUser();
  if (user) redirect(next || (role === "business" ? "/app" : "/me"));

  const keep = new URLSearchParams();
  keep.set("country", country);
  if (ref) keep.set("ref", ref);
  if (invite) keep.set("invite", invite);
  if (next) keep.set("next", next);
  const tab = (r: string, label: string) => (
    <Link
      href={`/register?role=${r}&${keep.toString()}`}
      aria-current={role === r ? "page" : undefined}
      className={`flex-1 rounded-xl px-3 py-2 text-center text-sm font-medium ${role === r ? "bg-neon text-black" : "text-muted hover:text-text"}`}
    >
      {label}
    </Link>
  );

  return (
    <main className="container-x flex min-h-dvh max-w-md flex-col justify-center py-10">
      <Link href="/" className="mb-6 text-2xl font-extrabold tracking-tight"><span className="glow-text">QR</span>onus</Link>
      <div className="card">
        <h1 className="mb-1 text-xl font-bold">Регистрация</h1>
        <p className="mb-4 text-sm text-muted">{role === "business" ? "Создайте бонусную карту для своего заведения." : "Копите бонусы в любимых заведениях."}</p>
        <div className="mb-4 flex gap-1 rounded-2xl border border-line bg-surface-2 p-1">
          {tab("business", "Я бизнес")}
          {tab("customer", "Я клиент")}
        </div>
        {isDemoMode() && <div className="mb-4"><Notice tone="warn">Тестовый режим: не вводите реальные персональные данные</Notice></div>}
        <ActionForm action={registerAction} className="space-y-4">
          <input type="hidden" name="role" value={role} />
          <input type="hidden" name="ref" value={ref} />
          <input type="hidden" name="invite" value={invite} />
          <input type="hidden" name="next" value={next} />
          <Field label="Имя"><input className="input" name="name" autoComplete="name" maxLength={80} /></Field>
          <Field label="Email"><input className="input" type="email" name="email" autoComplete="email" required /></Field>
          <Field label="Пароль" hint="Не менее 8 символов"><input className="input" type="password" name="password" autoComplete="new-password" minLength={8} required /></Field>
          <Field label="Страна">
            <select className="input" name="country" defaultValue={country}>
              <option value="RU">Россия</option>
              <option value="BY">Беларусь</option>
            </select>
          </Field>
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" name="acceptTerms" required className="mt-1 h-4 w-4 accent-[#39ff88]" />
            <span>Я принимаю <Link href="/ru/usloviya" className="text-neon underline underline-offset-4" target="_blank">Условия использования</Link></span>
          </label>
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" name="acceptPd" required className="mt-1 h-4 w-4 accent-[#39ff88]" />
            <span>
              Даю <Link href="/ru/soglasie" className="text-neon underline underline-offset-4" target="_blank">согласие на обработку персональных данных</Link>{" "}
              (<Link href="/ru/politika-konfidencialnosti" className="text-neon underline underline-offset-4" target="_blank">политика конфиденциальности</Link>)
            </span>
          </label>
          <SubmitButton className="btn-primary w-full">Создать аккаунт</SubmitButton>
        </ActionForm>
      </div>
      <p className="mt-4 text-center text-sm text-muted">
        Уже есть аккаунт? <Link className="text-neon underline underline-offset-4" href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"}>Войти</Link>
      </p>
    </main>
  );
}
