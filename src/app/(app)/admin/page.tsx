import type { Metadata } from "next";
import { desc, eq, ilike, or } from "drizzle-orm";
import { Notice, formatDate } from "@/components/app/ui";
import { pick, rec, type Rec } from "@/components/app/adapt";
import { formatMoney, type CurrencyCode } from "@/lib/plans";
import { db, schema } from "@/server/db";
import { requirePlatformAdmin } from "@/server/auth/session";
import { getPlatformStats } from "@/server/loyalty/service";
import { getPaymentDiagnostics } from "@/server/payments/service";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Админ-панель", robots: { index: false, follow: false } };

const LABELS: Record<string, string> = {
  users: "Пользователи", customers: "Клиенты", businesses: "Бизнесы", companies: "Компании", venues: "Заведения", programs: "Программы",
  cards: "Карты", transactions: "Операции", activeCompanies: "Активные компании", paidCompanies: "Платящие компании", payingCompanies: "Платящие компании",
  payments: "Оплаты", signups: "Регистрации", newUsers: "Новые пользователи", newCompanies: "Новые компании", accruals: "Начисления", redemptions: "Списания",
  proCompanies: "PRO", topCompanies: "TOP", freeCompanies: "FREE", pageViews: "Просмотры страниц", referralClicks: "Клики по рефералкам",
};
const MONEY_KEYS = new Set(["revenue", "revenueMinor", "mrr", "mrrMinor", "money", "moneyMinor", "paidMinor", "paid", "income"]);

function Money({ value }: { value: unknown }) {
  const m = rec(value);
  const cells = (["RUB", "BYN"] as CurrencyCode[]).filter((c) => m[c] !== undefined);
  if (cells.length === 0) return <>—</>;
  return (
    <span className="space-x-3">
      {cells.map((c) => <span key={c}>{formatMoney(Number(m[c]) || 0, c)}</span>)}
    </span>
  );
}

function Block({ title, data }: { title: string; data: unknown }) {
  const r: Rec = rec(data);
  const entries = Object.entries(r);
  return (
    <div className="card">
      <h2 className="mb-3 font-semibold">{title}</h2>
      {entries.length === 0 ? (
        <p className="text-sm text-muted">Нет данных</p>
      ) : (
        <dl className="space-y-2 text-sm">
          {entries.map(([k, v]) => {
            const isMoney = MONEY_KEYS.has(k) || (typeof v === "object" && v !== null && ("RUB" in v || "BYN" in v));
            if (!isMoney && typeof v === "object") return null;
            return (
              <div key={k} className="flex justify-between gap-3">
                <dt className="text-muted">{LABELS[k] ?? k}</dt>
                <dd className="text-right font-semibold">{isMoney ? <Money value={v} /> : String(v)}</dd>
              </div>
            );
          })}
        </dl>
      )}
    </div>
  );
}

export default async function AdminPage() {
  await requirePlatformAdmin();
  const [stats, diag, errors, failed] = await Promise.all([
    getPlatformStats(),
    getPaymentDiagnostics(),
    db
      .select()
      .from(schema.auditLogs)
      .where(or(ilike(schema.auditLogs.action, "%error%"), ilike(schema.auditLogs.action, "%fail%"), ilike(schema.auditLogs.action, "%denied%")))
      .orderBy(desc(schema.auditLogs.createdAt))
      .limit(20),
    db.select().from(schema.payments).where(eq(schema.payments.status, "FAILED")).orderBy(desc(schema.payments.createdAt)).limit(10),
  ]);
  const notes = (process.env.FREE_TIER_NOTES ?? "").split(/\r?\n|\|/).map((s) => s.trim()).filter(Boolean);

  return (
    <main className="container-x py-8">
      <h1 className="mb-1 text-2xl font-bold">Админ-панель</h1>
      <p className="mb-6 text-sm text-muted">Валюты RUB и BYN показаны раздельно и никогда не суммируются.</p>

      <div className="grid gap-4 md:grid-cols-3">
        <Block title="Россия" data={pick(stats, "RU", "ru", "russia")} />
        <Block title="Беларусь" data={pick(stats, "BY", "by", "belarus")} />
        <Block title="Всего" data={pick(stats, "total", "totals", "all")} />
      </div>

      <h2 className="mb-3 mt-8 font-semibold">Диагностика платежей</h2>
      <pre className="card overflow-x-auto text-xs">{JSON.stringify(diag, null, 2)}</pre>

      <h2 className="mb-3 mt-8 font-semibold">Последние ошибки</h2>
      <div className="card divide-y divide-line !p-0 text-sm">
        {failed.length === 0 && errors.length === 0 && <p className="p-4 text-muted">Ошибок нет.</p>}
        {failed.map((p) => (
          <div key={p.id} className="px-4 py-3">
            <div className="font-medium">Неуспешная оплата #{p.invoiceNo} · {p.provider} · {p.plan}</div>
            <div className="text-xs text-muted">{formatDate(p.createdAt)} · {formatMoney(p.amountMinor, p.currency)} · {p.failReason ?? "причина не указана"}</div>
          </div>
        ))}
        {errors.map((e) => (
          <div key={e.id} className="px-4 py-3">
            <div className="font-medium">{e.action}</div>
            <div className="break-all text-xs text-muted">{formatDate(e.createdAt)}{e.companyId ? ` · компания ${e.companyId}` : ""}{e.meta ? ` · ${JSON.stringify(e.meta).slice(0, 200)}` : ""}</div>
          </div>
        ))}
      </div>

      <h2 className="mb-3 mt-8 font-semibold">Инфраструктура и бесплатные лимиты</h2>
      {notes.length > 0 ? (
        <ul className="card list-disc space-y-1 pl-9 text-sm">{notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
      ) : (
        <Notice>Переменная FREE_TIER_NOTES не задана. Добавьте заметки о лимитах бесплатных тарифов хостинга и БД (разделитель — перенос строки или «|»).</Notice>
      )}
    </main>
  );
}
