import Link from "next/link";
import type { ReactNode } from "react";
import { SubmitButton } from "./SubmitButton";

const LINKS = [
  { href: "/me", label: "Карты" },
  { href: "/me/qr", label: "Мой QR" },
  { href: "/me/profile", label: "Профиль" },
];

export function CustomerShell({ children, logoutAction }: { children: ReactNode; logoutAction: () => Promise<void> }) {
  return (
    <div className="min-h-dvh">
      <header className="border-b border-line bg-surface">
        <div className="container-x flex items-center justify-between gap-3 py-3">
          <Link href="/me" className="text-lg font-extrabold tracking-tight">BONUS<span className="glow-text">GO</span></Link>
          <nav aria-label="Меню клиента" className="flex items-center gap-1 text-sm">
            {LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="rounded-xl px-3 py-2 text-muted hover:bg-surface-2 hover:text-text">{l.label}</Link>
            ))}
            <form action={logoutAction}><SubmitButton className="btn-ghost !px-3 !py-1.5 text-xs">Выйти</SubmitButton></form>
          </nav>
        </div>
      </header>
      <main className="container-x max-w-2xl py-6 pb-16">{children}</main>
    </div>
  );
}
