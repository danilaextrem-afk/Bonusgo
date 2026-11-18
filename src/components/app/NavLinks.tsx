"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

export interface NavItem { href: string; label: string; icon: string }

function isActive(path: string, href: string) {
  return href === "/app" ? path === "/app" : path === href || path.startsWith(href + "/");
}

export function SideNav({ items }: { items: NavItem[] }) {
  const path = usePathname();
  return (
    <nav aria-label="Основное меню" className="flex flex-col gap-1">
      {items.map((i) => (
        <Link
          key={i.href}
          href={i.href}
          aria-current={isActive(path, i.href) ? "page" : undefined}
          className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${isActive(path, i.href) ? "bg-neon/10 font-semibold text-neon" : "text-muted hover:bg-surface-2 hover:text-text"}`}
        >
          <span aria-hidden className="w-5 text-center">{i.icon}</span>
          {i.label}
        </Link>
      ))}
    </nav>
  );
}

export function BottomNav({ primary, more }: { primary: NavItem[]; more: NavItem[] }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  return (
    <>
      {open && more.length > 0 && (
        <div className="fixed inset-x-0 bottom-16 z-40 border-t border-line bg-surface p-3 shadow-2xl" role="menu">
          <div className="grid grid-cols-3 gap-2">
            {more.map((i) => (
              <Link key={i.href} href={i.href} role="menuitem" onClick={() => setOpen(false)} className="flex flex-col items-center gap-1 rounded-xl border border-line px-2 py-3 text-xs">
                <span aria-hidden className="text-lg">{i.icon}</span>
                {i.label}
              </Link>
            ))}
          </div>
        </div>
      )}
      <nav aria-label="Основное меню" className="fixed inset-x-0 bottom-0 z-50 flex border-t border-line bg-surface/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
        {primary.map((i) => (
          <Link
            key={i.href}
            href={i.href}
            onClick={() => setOpen(false)}
            aria-current={isActive(path, i.href) ? "page" : undefined}
            className={`flex min-h-16 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] ${isActive(path, i.href) ? "text-neon" : "text-muted"}`}
          >
            <span aria-hidden className="text-xl leading-none">{i.icon}</span>
            {i.label}
          </Link>
        ))}
        {more.length > 0 && (
          <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className={`flex min-h-16 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] ${open ? "text-neon" : "text-muted"}`}>
            <span aria-hidden className="text-xl leading-none">☰</span>
            Ещё
          </button>
        )}
      </nav>
    </>
  );
}
