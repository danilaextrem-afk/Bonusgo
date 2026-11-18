import Link from "next/link";
import { Empty, PageHeader, formatDate } from "@/components/app/ui";
import { asArray, pNum, pStr, pick } from "@/components/app/adapt";
import { requireCompanyContext, sp1 } from "@/components/app/data";
import { listCustomers } from "@/server/loyalty/service";

export const dynamic = "force-dynamic";
const PAGE = 20;

export default async function CustomersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const { company, limits } = await requireCompanyContext();
  const q = (sp1(sp.q) ?? "").trim().slice(0, 80);
  const page = Math.max(1, Math.min(1000, Number(sp1(sp.page)) || 1));
  const raw = await listCustomers(company.id, { q: q || undefined, limit: PAGE + 1, offset: (page - 1) * PAGE });
  const all = asArray(raw, "customers");
  const rows = all.slice(0, PAGE);
  const hasNext = all.length > PAGE;
  const href = (p: number) => `/app/customers?${new URLSearchParams({ ...(q ? { q } : {}), page: String(p) }).toString()}`;
  return (
    <>
      <PageHeader title="Клиенты" />
      <form className="mb-4 flex gap-2" role="search">
        <input className="input" name="q" defaultValue={q} placeholder="Поиск по имени или email" aria-label="Поиск клиентов" maxLength={80} />
        <button className="btn-primary" type="submit">Найти</button>
      </form>
      {rows.length === 0 ? (
        <Empty>{q ? "Никого не нашли." : "Клиентов пока нет. Покажите гостям QR-код заведения."}</Empty>
      ) : (
        <div className="card divide-y divide-line !p-0">
          {rows.map((r, i) => {
            const cardId = pStr(r, "cardId", "id");
            const name = pStr(r, "customerName", "name") || pStr(r, "customerEmail", "email") || "Клиент";
            const email = pStr(r, "customerEmail", "email");
            const program = pStr(r, "programName", "program");
            const last = pick(r, "lastActivityAt", "lastVisitAt", "updatedAt");
            const inner = (
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="truncate font-medium">{name}</div>
                  <div className="truncate text-xs text-muted">{[email && email !== name ? email : "", program, formatDate(last as string | Date | undefined)].filter(Boolean).join(" · ")}</div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-neon">{pNum(r, "balance")}</div>
                  <div className="text-xs text-muted">баланс</div>
                </div>
              </div>
            );
            return limits.history && cardId ? (
              <Link key={cardId || i} href={`/app/customers/${cardId}`} className="block hover:bg-surface-2">{inner}</Link>
            ) : (
              <div key={cardId || i}>{inner}</div>
            );
          })}
        </div>
      )}
      {!limits.history && rows.length > 0 && (
        <p className="mt-3 text-xs text-muted">🔒 История операций по клиенту — на тарифах PRO и TOP. <Link href="/app/billing" className="text-neon underline underline-offset-4">Улучшить</Link></p>
      )}
      <div className="mt-4 flex justify-between">
        {page > 1 ? <Link className="btn-ghost" href={href(page - 1)}>← Назад</Link> : <span />}
        {hasNext && <Link className="btn-ghost" href={href(page + 1)}>Дальше →</Link>}
      </div>
    </>
  );
}
