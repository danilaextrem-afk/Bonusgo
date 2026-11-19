import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq, ilike, or } from "drizzle-orm";
import { Notice, formatDate } from "@/components/app/ui";
import { formatMoney } from "@/lib/plans";
import { db, schema } from "@/server/db";
import { requirePlatformAdmin } from "@/server/auth/session";
import { getPlatformStats } from "@/server/loyalty/service";
import { getPaymentDiagnostics } from "@/server/payments/service";
import { listSbpClaims } from "@/server/payments/sbp";
import { SbpClaims } from "@/components/app/SbpClaims";
import { FunnelBars, Flag, MarketTabs, MrrTile, StatTile, type Market } from "@/components/admin/AdminParts";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Админ-панель", robots: { index: false, follow: false } };

const STATUS_RU: Record<string, string> = { PENDING: "Ожидает", PAID: "Оплачен", FAILED: "Неуспешно", REFUNDED: "Возврат", CANCELED: "Отменён", CANCELLED: "Отменён" };

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ market?: string }> }) {
  const admin = await requirePlatformAdmin();
  const sp = await searchParams;
  const market: Market = sp.market === "RU" || sp.market === "BY" ? sp.market : "ALL";
  const [stats, diag, errors, failed, claims] = await Promise.all([
    getPlatformStats(),
    getPaymentDiagnostics(),
    db
      .select()
      .from(schema.auditLogs)
      .where(or(ilike(schema.auditLogs.action, "%error%"), ilike(schema.auditLogs.action, "%fail%"), ilike(schema.auditLogs.action, "%denied%")))
      .orderBy(desc(schema.auditLogs.createdAt))
      .limit(20),
    db.select().from(schema.payments).where(eq(schema.payments.status, "FAILED")).orderBy(desc(schema.payments.createdAt)).limit(10),
    listSbpClaims(30),
  ]);
  const pending = claims.filter((c) => c.payment.status === "PENDING").length;
  const notes = (process.env.FREE_TIER_NOTES ?? "").split(/\r?\n|\|/).map((s) => s.trim()).filter(Boolean);
  const b = market === "RU" ? stats.RU : market === "BY" ? stats.BY : stats.total;
  const f = stats.funnel;
  const c = stats.conversion;
  const funnelRows = [
    { label: "Просмотры страниц", value: f.page_view },
    { label: "Органические визиты", value: f.organic_visits },
    { label: "Регистрации бизнеса", value: f.signup_business },
    { label: "Первая карта", value: f.first_card },
    { label: "Заведение активировано", value: f.venue_activated },
    { label: "Оплата", value: f.paid },
    { label: "Клики по рефералкам", value: f.referral_click },
  ];
  const conv = [
    { label: "Визит → регистрация", v: c.visitToSignup },
    { label: "Регистрация → 1-я карта", v: c.signupToFirstCard },
    { label: "1-я карта → активация", v: c.firstCardToActivated },
    { label: "Регистрация → оплата", v: c.signupToPaid },
  ];
  const errCount = failed.length + errors.length;
  const statusEntries = Object.entries(diag.countsByStatus);

  return (
    <main className="container-x overflow-x-hidden py-6">
      <h1 className="mb-1 text-2xl font-bold">Админ-панель</h1>
      <p className="mb-5 text-sm text-muted">Валюты RUB и BYN показаны раздельно и никогда не суммируются.</p>
      {admin.platformRole === "ADMIN" && (
        <div className="mb-5">
          <Link href="/admin/ledger" className="text-sm font-semibold underline">
            Проверить расхождения бонусных балансов
          </Link>
        </div>
      )}

      <section className="mb-8">
        <h2 className="mb-2 flex flex-wrap items-center gap-2 font-semibold">Оплаты по СБП {pending > 0 && <span className="badge">ждут: {pending}</span>}</h2>
        <p className="mb-3 text-sm text-muted">Проверьте поступление в приложении Т-Банка по сумме и коду в комментарии, затем подтвердите.</p>
        <div className="min-w-0 max-w-full overflow-x-auto"><SbpClaims claims={claims} /></div>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 font-semibold">Статистика</h2>
        <MarketTabs active={market} />
        <div className="mt-3 grid grid-cols-2 gap-3">
          <StatTile label="Компании" value={b.companies} />
          <StatTile label="Заведения" value={b.venues} />
          <StatTile label="Программы" value={b.programs} />
          <StatTile label="Карты" value={b.cards} />
          <StatTile label="Регистрации 7 дн." value={b.signups7d} />
          <StatTile label="Регистрации 30 дн." value={b.signups30d} />
          <StatTile label="Платящие компании" value={b.paidCompanies} />
          <StatTile label="Сбои оплат 30 дн." value={b.paymentFailures30d} />
          <MrrTile mrr={b.mrr} market={market} />
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 font-semibold">Воронка (30 дней)</h2>
        <div className="card">
          <FunnelBars rows={funnelRows} />
          <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-line pt-3 text-sm">
            {conv.map((x) => (
              <div key={x.label} className="min-w-0">
                <dt className="text-xs text-muted">{x.label}</dt>
                <dd className="font-semibold text-neon">{x.v}%</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 font-semibold">Диагностика платежей</h2>
        <div className="card space-y-4 text-sm">
          <table className="w-full table-fixed">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="w-[30%] pb-2 font-normal">Страна</th>
                <th className="w-[22%] pb-2 font-normal">Провайдер</th>
                <th className="pb-2 font-normal">Флаги</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {(["RU", "BY"] as const).map((k) => {
                const d = diag.countries[k];
                return (
                  <tr key={k} className="align-top">
                    <td className="py-2 font-semibold">{k === "RU" ? "Россия" : "Беларусь"}</td>
                    <td className="break-words py-2">{d.provider}</td>
                    <td className="py-2">
                      <div className="flex flex-wrap gap-1">
                        <Flag on={d.configured} onLabel="настроен" offLabel="не настроен" />
                        <Flag on={d.live} onLabel="live" offLabel="не live" />
                        <Flag on={d.testMode} onLabel="тест" offLabel="не тест" />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div>
            <div className="mb-2 text-xs text-muted">Платежи по статусам</div>
            {statusEntries.length === 0 ? (
              <p className="text-muted">Платежей пока нет.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {statusEntries.map(([k, n]) => <span key={k} className="badge">{STATUS_RU[k] ?? k}: {n}</span>)}
              </div>
            )}
          </div>
          <div className="flex justify-between gap-3 border-t border-line pt-3">
            <span className="text-muted">Сбои за 30 дней</span>
            <span className={`font-semibold ${diag.failures30d > 0 ? "text-danger" : ""}`}>{diag.failures30d}</span>
          </div>
          <details>
            <summary className="flex min-h-10 cursor-pointer items-center font-medium">Последние события ({diag.lastEvents.length})</summary>
            {diag.lastEvents.length === 0 ? (
              <p className="mt-2 text-muted">Событий нет.</p>
            ) : (
              <ul className="mt-2 divide-y divide-line">
                {diag.lastEvents.map((e) => (
                  <li key={e.id} className="py-2">
                    <div className="break-all font-medium">{e.provider} · {e.kind}</div>
                    <div className="break-all text-xs text-muted">{formatDate(e.receivedAt)} · {e.verified ? "подпись проверена" : "не проверено"} · {e.eventKey}</div>
                  </li>
                ))}
              </ul>
            )}
          </details>
        </div>
      </section>

      <section className="mb-8">
        <details className="card !p-0">
          <summary className="cursor-pointer px-4 py-3 font-semibold">Последние ошибки ({errCount})</summary>
          <div className="divide-y divide-line border-t border-line text-sm">
            {errCount === 0 && <p className="p-4 text-muted">Ошибок нет.</p>}
            {failed.map((p) => (
              <div key={p.id} className="px-4 py-3">
                <div className="font-medium">Неуспешная оплата #{p.invoiceNo} · {p.provider} · {p.plan}</div>
                <div className="break-words text-xs text-muted">{formatDate(p.createdAt)} · {formatMoney(p.amountMinor, p.currency)} · {p.failReason ?? "причина не указана"}</div>
              </div>
            ))}
            {errors.map((e) => (
              <div key={e.id} className="px-4 py-3">
                <div className="break-all font-medium">{e.action}</div>
                <div className="break-all text-xs text-muted">{formatDate(e.createdAt)}{e.companyId ? ` · компания ${e.companyId}` : ""}{e.meta ? ` · ${JSON.stringify(e.meta).slice(0, 200)}` : ""}</div>
              </div>
            ))}
          </div>
        </details>
      </section>

      <section>
        <h2 className="mb-3 font-semibold">Инфраструктура и бесплатные лимиты</h2>
        {notes.length > 0 ? (
          <ul className="card list-disc space-y-1 pl-9 text-sm">{notes.map((n, i) => <li key={i} className="break-words">{n}</li>)}</ul>
        ) : (
          <Notice>Переменная FREE_TIER_NOTES не задана. Добавьте заметки о лимитах бесплатных тарифов хостинга и БД (разделитель — перенос строки или «|»).</Notice>
        )}
      </section>
    </main>
  );
}
