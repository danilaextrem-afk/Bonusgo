import type { ReactNode } from "react";
import Link from "next/link";
import { formatMoney, type CurrencyCode } from "@/lib/plans";

export type Market = "RU" | "BY" | "ALL";

export function MarketTabs({ active }: { active: Market }) {
  const items: { id: Market; label: string }[] = [
    { id: "RU", label: "Россия" },
    { id: "BY", label: "Беларусь" },
    { id: "ALL", label: "Всего" },
  ];
  return (
    <nav className="grid grid-cols-3 gap-1 rounded-xl border border-line bg-surface p-1" aria-label="Рынок">
      {items.map((i) => (
        <Link
          key={i.id}
          href={`/admin?market=${i.id}`}
          scroll={false}
          aria-current={active === i.id ? "page" : undefined}
          className={`rounded-lg px-2 py-2.5 text-center text-sm font-semibold ${active === i.id ? "bg-surface-2 text-neon" : "text-muted"}`}
        >
          {i.label}
        </Link>
      ))}
    </nav>
  );
}

export function StatTile({ label, value, wide }: { label: string; value: ReactNode; wide?: boolean }) {
  return (
    <div className={`card min-w-0 !p-3 ${wide ? "col-span-2" : ""}`}>
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 break-words text-xl font-bold">{value}</div>
    </div>
  );
}

export function MrrTile({ mrr, market }: { mrr: Partial<Record<CurrencyCode, number>>; market: Market }) {
  const cur: CurrencyCode[] = market === "RU" ? ["RUB"] : market === "BY" ? ["BYN"] : ["RUB", "BYN"];
  return (
    <div className="card col-span-2 min-w-0 !p-3">
      <div className="text-xs text-muted">MRR (валюты раздельно)</div>
      <div className="mt-1 flex flex-wrap gap-x-6 gap-y-1 text-xl font-bold">
        {cur.map((c) => <span key={c} className="glow-text">{formatMoney(Number(mrr[c] ?? 0), c)}</span>)}
      </div>
    </div>
  );
}

export function FunnelBars({ rows }: { rows: { label: string; value: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="mb-1 flex justify-between gap-3 text-sm">
            <span className="min-w-0 break-words text-muted">{r.label}</span>
            <span className="font-semibold">{r.value}</span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-neon" style={{ width: `${Math.max(r.value > 0 ? 2 : 0, Math.round((r.value / max) * 100))}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function Flag({ on, onLabel, offLabel }: { on: boolean; onLabel: string; offLabel: string }) {
  return <span className={`badge ${on ? "" : "!text-muted"}`}>{on ? onLabel : offLabel}</span>;
}
