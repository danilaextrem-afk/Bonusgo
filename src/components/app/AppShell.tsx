import Link from "next/link";
import type { ReactNode } from "react";
import { BottomNav, SideNav, type NavItem } from "./NavLinks";
import { CompanySwitcher } from "./CompanySwitcher";
import { SubmitButton } from "./SubmitButton";
import { PLAN_NAMES } from "./ui";

const ALL: NavItem[] = [
  { href: "/app", label: "Обзор", icon: "◎" },
  { href: "/app/scan", label: "Сканер", icon: "▣" },
  { href: "/app/customers", label: "Клиенты", icon: "☺" },
  { href: "/app/qr", label: "QR", icon: "▦" },
  { href: "/app/venues", label: "Заведения", icon: "⌂" },
  { href: "/app/programs", label: "Программы", icon: "★" },
  { href: "/app/analytics", label: "Аналитика", icon: "▥" },
  { href: "/app/staff", label: "Сотрудники", icon: "☷" },
  { href: "/app/billing", label: "Тариф", icon: "₽" },
  { href: "/app/export", label: "Экспорт", icon: "⇩" },
  { href: "/app/settings", label: "Настройки", icon: "⚙" },
];
const STAFF_NAV: NavItem[] = [ALL[1]];
const PRIMARY = new Set(["/app", "/app/scan", "/app/customers", "/app/qr"]);

export function AppShell({
  children,
  userName,
  companies,
  currentId,
  currentName,
  role,
  plan,
  switchAction,
  logoutAction,
}: {
  children: ReactNode;
  userName: string;
  companies: { id: string; name: string }[];
  currentId: string | null;
  currentName: string | null;
  role: string | null;
  plan: "FREE" | "PRO" | "TOP" | null;
  switchAction: (fd: FormData) => Promise<void>;
  logoutAction: () => Promise<void>;
}) {
  const items = role === "STAFF" ? STAFF_NAV : currentId ? ALL : [];
  const primary = items.filter((i) => PRIMARY.has(i.href));
  const more = items.filter((i) => !PRIMARY.has(i.href));
  const bottomPrimary = role === "STAFF" ? items : primary;

  return (
    <div className="min-h-dvh lg:flex">
      <aside className="hidden w-64 shrink-0 flex-col gap-5 border-r border-line bg-surface p-4 lg:flex lg:sticky lg:top-0 lg:h-dvh lg:overflow-y-auto">
        <Link href="/app" className="text-xl font-extrabold tracking-tight"><span className="glow-text">QR</span>onus</Link>
        {currentId && currentName && (
          <div className="space-y-3">
            <div>
              <div className="truncate text-sm font-semibold">{currentName}</div>
              {plan && <span className="badge mt-1">{PLAN_NAMES[plan]}</span>}
            </div>
            <CompanySwitcher companies={companies} currentId={currentId} action={switchAction} />
          </div>
        )}
        <SideNav items={items} />
        <div className="mt-auto space-y-2 border-t border-line pt-4 text-sm">
          <div className="truncate text-muted">{userName}</div>
          <form action={logoutAction}><SubmitButton className="btn-ghost w-full">Выйти</SubmitButton></form>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="flex items-center justify-between gap-3 border-b border-line bg-surface px-4 py-3 lg:hidden">
          <Link href="/app" className="text-lg font-extrabold tracking-tight"><span className="glow-text">QR</span>onus</Link>
          <div className="flex min-w-0 items-center gap-2">
            {currentName && <span className="max-w-[40vw] truncate text-xs text-muted">{currentName}</span>}
            {plan && <span className="badge">{PLAN_NAMES[plan]}</span>}
            <form action={logoutAction}><SubmitButton className="btn-ghost !px-3 !py-1.5 text-xs">Выйти</SubmitButton></form>
          </div>
        </header>
        {companies.length > 1 && currentId && (
          <div className="border-b border-line px-4 py-2 lg:hidden">
            <CompanySwitcher companies={companies} currentId={currentId} action={switchAction} />
          </div>
        )}
        <main className="container-x py-6 pb-28 lg:pb-10">{children}</main>
      </div>
      {items.length > 0 && (
        <div className="lg:hidden">
          <BottomNav primary={bottomPrimary} more={role === "STAFF" ? [] : more} />
        </div>
      )}
    </div>
  );
}
