import Link from "next/link";
import type { Metadata } from "next";
import { Logo } from "@/components/site/Header";

export const metadata: Metadata = { title: { absolute: "Страница не найдена — BONUSGO" }, robots: { index: false, follow: true } };

const LINKS = [
  { href: "/ru", label: "Главная · Россия" },
  { href: "/by", label: "Главная · Беларусь" },
  { href: "/ru/tarify", label: "Тарифы" },
  { href: "/ru/instrumenty", label: "Бесплатные инструменты" },
  { href: "/ru/baza-znaniy", label: "База знаний" },
  { href: "/ru/faq", label: "Вопросы и ответы" },
];

export default function NotFound() {
  return (
    <main className="container-x flex min-h-dvh flex-col items-center justify-center py-16 text-center">
      <Logo href="/" />
      <p className="mt-10 text-7xl font-extrabold glow-text">404</p>
      <h1 className="mt-4 text-2xl font-bold text-text sm:text-3xl">Такой страницы нет</h1>
      <p className="mt-3 max-w-md text-muted">Возможно, адрес изменился или в нём опечатка. Перейдите в один из разделов.</p>
      <ul className="mt-8 flex max-w-xl flex-wrap justify-center gap-3">
        {LINKS.map((l) => (
          <li key={l.href}><Link href={l.href} className="btn-ghost !py-2">{l.label}</Link></li>
        ))}
      </ul>
    </main>
  );
}
