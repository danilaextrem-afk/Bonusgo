import Link from "next/link";
import type { ReactNode } from "react";
import { SubmitButton } from "./SubmitButton";

const LINKS = [
  { href: "/me", label: "Карты" },
  { href: "/me/qr", label: "Мой QR" },
  { href: "/me/profile", label: "Профиль" },
];

export function CustomerShell({ children, logoutAction, isAdmin = false }: { children: ReactNode; logoutAction: () => Promise<void>; isAdmin?: boolean }) {
  const links = isAdmin ? [...LINKS, { href: "/admin", label: "Админка" }] : LINKS;
  return (
    <div className="min-h-dvh">
      <header className="border-b border-line bg-surface">
        <div className="container-x flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2">
          <Link href="/me" className="inline-flex min-h-10 items-center text-lg font-extrabold tracking-tight"><span className="glow-text">QR</span>onus</Link>
          <nav aria-label="Меню клиента" className="order-last flex w-full items-center justify-between gap-1 text-sm sm:order-none sm:w-auto sm:justify-start">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="inline-flex min-h-10 items-center whitespace-nowrap rounded-xl px-3 py-2 text-muted hover:bg-surface-2 hover:text-text">{l.label}</Link>
            ))}
            <form action={logoutAction}><SubmitButton className="btn-ghost min-h-10 !px-3 !py-1.5 text-xs">Выйти</SubmitButton></form>
          </nav>
        </div>
      </header>
      <main className="container-x max-w-2xl py-6 pb-16">{children}</main>
    </div>
  );
}
