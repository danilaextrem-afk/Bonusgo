"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { CP } from "@/lib/seo";
import { CountrySwitch } from "./CountrySwitch";

export function Logo({ href }: { href: string }) {
  return (
    <Link href={href} aria-label="QRonus — на главную" className="inline-flex min-h-10 items-center text-xl font-extrabold tracking-tight text-text">
      <span className="text-neon">QR</span>onus
    </Link>
  );
}

const NAV = [
  { path: "/vozmozhnosti", label: "Возможности" },
  { path: "/resheniya", label: "Решения" },
  { path: "/tarify", label: "Тарифы" },
  { path: "/instrumenty", label: "Инструменты" },
  { path: "/baza-znaniy", label: "База знаний" },
  { path: "/demo", label: "Демо" },
];

export function Header({ country, shared, staticPaths }: { country: CP; shared: string[]; staticPaths: string[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    // close the mobile menu after navigation
    const t = setTimeout(() => setOpen(false), 0);
    return () => clearTimeout(t);
  }, [pathname]);
  const base = `/${country}`;
  const register = `/register?country=${country === "ru" ? "RU" : "BY"}`;
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur">
      <div className="container-x flex h-16 items-center justify-between gap-4">
        <Logo href={base} />
        <nav aria-label="Основная навигация" className="hidden items-center gap-1 lg:flex">
          {NAV.map((n) => {
            const href = base + n.path;
            const active = pathname === href || pathname.startsWith(href + "/");
            return (
              <Link key={n.path} href={href} aria-current={active ? "page" : undefined} className={`rounded-lg px-3 py-2 text-sm transition hover:text-neon ${active ? "text-neon" : "text-muted"}`}>
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-2">
          <div className="hidden sm:block">
            <CountrySwitch country={country} shared={shared} staticPaths={staticPaths} />
          </div>
          <Link href="/login" className="hidden px-3 py-2 text-sm text-muted hover:text-neon md:inline-block">Войти</Link>
          <Link href={register} className="btn-primary hidden !px-4 !py-2 md:inline-flex">Создать карту</Link>
          <button
            type="button"
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-line text-text lg:hidden"
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? "Закрыть меню" : "Открыть меню"}
            onClick={() => setOpen((v) => !v)}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              {open ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>
      </div>
      {open && (
        <div id="mobile-menu" className="border-t border-line bg-bg lg:hidden">
          <nav aria-label="Мобильная навигация" className="container-x flex flex-col py-3">
            {NAV.map((n) => (
              <Link key={n.path} href={base + n.path} className="rounded-lg px-2 py-3 text-base text-text hover:text-neon">
                {n.label}
              </Link>
            ))}
            <div className="mt-2 flex flex-wrap items-center gap-3 border-t border-line pt-4">
              <CountrySwitch country={country} shared={shared} staticPaths={staticPaths} />
              <Link href="/login" className="btn-ghost !py-2">Войти</Link>
              <Link href={register} className="btn-primary !py-2">Создать карту</Link>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
