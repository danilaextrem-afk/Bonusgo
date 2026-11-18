import { ActionForm } from "@/components/app/ActionForm";
import { SubmitButton } from "@/components/app/SubmitButton";
import { UsageBar } from "@/components/app/UsageBar";
import { Notice, PLAN_NAMES, PageHeader, formatDate } from "@/components/app/ui";
import { requireCompanyContext, sp1 } from "@/components/app/data";
import { COUNTRY, PLAN_LIMITS, PLAN_PRICES, formatMoney, type PlanId } from "@/lib/plans";
import { getCsrfToken } from "@/server/auth/session";
import { getUsage } from "@/server/limits";
import { and, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { db, schema } from "@/server/db";
import { receiptUrl } from "@/server/payments/npd";
import { cancelSubscriptionAction } from "../actions";

export const dynamic = "force-dynamic";

const FEATURES: Record<Exclude<PlanId, "FREE">, string[]> = {
  PRO: ["До 1000 активных клиентов", "3 программы, баллы и награды", "История операций и аналитика", "До 3 сотрудников", "Свой логотип и цвет"],
  TOP: ["До 10 000 клиентов, 20 заведений", "50 программ, 100 сотрудников", "Экспорт CSV", "Без метки BONUSGO на плакате", "Реферальная программа"],
};

export default async function BillingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const status = sp1(sp.status);
  const { company, plan, role } = await requireCompanyContext();
  const [usage, csrf, history] = await Promise.all([
    getUsage(company.id),
    getCsrfToken(),
    db.select().from(schema.payments).where(and(eq(schema.payments.companyId, company.id), eq(schema.payments.testMode, false))).orderBy(desc(schema.payments.createdAt)).limit(12),
  ]);
  const cur = COUNTRY[company.country].currency;
  const isOwner = role === "OWNER";
  const rank: Record<PlanId, number> = { FREE: 0, PRO: 1, TOP: 2 };
  return (
    <>
      <PageHeader title="Тариф и оплата" subtitle={`Сейчас: ${PLAN_NAMES[plan]}${company.planExpiresAt && plan !== "FREE" ? ` · действует до ${formatDate(company.planExpiresAt).split(",")[0]}` : ""}`} />
      <div className="space-y-4">
        {status === "success" && <Notice tone="ok">Оплата прошла. Тариф обновится в течение минуты — если нет, обновите страницу.</Notice>}
        {status === "unavailable" && <Notice tone="warn">Оплата временно недоступна. Попробуйте позже или напишите нам.</Notice>}
        {status === "fail" && <Notice tone="danger">Оплата не прошла. Деньги не списаны. Попробуйте ещё раз или другой способ оплаты.</Notice>}
        {company.country === "BY" && (
          <Notice tone="warn">Оплата в BYN появится после подключения платёжного провайдера. Цены ниже ориентировочные и подтверждаются при запуске оплаты.</Notice>
        )}

        <div className="card space-y-4">
          <h2 className="font-semibold">Использование</h2>
          <UsageBar label="Заведения" used={usage.venues} limit={usage.limits.venues} />
          <UsageBar label="Программы" used={usage.programs} limit={usage.limits.programs} />
          <UsageBar label="Активные клиенты" used={usage.activeCustomers} limit={usage.limits.activeCustomers} />
          <UsageBar label="Сотрудники" used={usage.staff} limit={usage.limits.staff} />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {(["PRO", "TOP"] as const).map((p) => {
            const price = PLAN_PRICES[company.country][p];
            const isCurrent = plan === p;
            const lower = rank[p] < rank[plan];
            return (
              <div key={p} className={`card flex flex-col ${isCurrent ? "border-neon/60" : ""}`}>
                <div className="flex items-baseline justify-between">
                  <h3 className="text-xl font-bold">{p}</h3>
                  {isCurrent && <span className="badge">Текущий</span>}
                </div>
                <div className="mt-2 text-3xl font-extrabold glow-text">{formatMoney(price, cur)}<span className="text-sm font-normal text-muted"> / мес</span></div>
                <ul className="my-4 space-y-1.5 text-sm text-muted">
                  {FEATURES[p].map((f) => <li key={f}>✓ {f}</li>)}
                  <li>Лимит клиентов: {PLAN_LIMITS[p].activeCustomers}</li>
                </ul>
                {isOwner && !lower ? (
                  <form method="POST" action="/api/payments/checkout" className="mt-auto space-y-3">
                    <input type="hidden" name="companyId" value={company.id} />
                    <input type="hidden" name="plan" value={p} />
                    <input type="hidden" name="csrf" value={csrf} />
                    <fieldset>
                      <legend className="label">Срок</legend>
                      <div className="grid grid-cols-3 gap-2">
                        {[1, 3, 12].map((m) => (
                          <label key={m} className="cursor-pointer rounded-xl border border-line px-2 py-2 text-center text-sm has-[:checked]:border-neon has-[:checked]:text-neon">
                            <input type="radio" name="months" value={m} defaultChecked={m === 1} className="sr-only" />
                            {m} мес
                          </label>
                        ))}
                      </div>
                    </fieldset>
                    <SubmitButton className="btn-primary w-full">{isCurrent ? "Продлить" : `Перейти на ${p}`}</SubmitButton>
                    <p className="text-xs text-muted">Итоговая сумма показывается на странице оплаты.</p>
                  </form>
                ) : (
                  <p className="mt-auto text-xs text-muted">{isOwner ? "Ваш тариф выше." : "Оплату может выполнить владелец компании."}</p>
                )}
              </div>
            );
          })}
        </div>

        {history.length > 0 && (
          <div className="card">
            <h2 className="mb-3 font-semibold">История оплат</h2>
            <ul className="divide-y divide-line text-sm">
              {history.map((h) => (
                <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>{h.plan} · {h.months} мес · {formatMoney(h.amountMinor, h.currency)}</span>
                  <span className="text-muted">
                    {h.status === "PAID" ? "оплачено" : h.status === "PENDING" ? (h.claimedAt ? "на проверке" : "ожидает оплаты") : h.status === "FAILED" ? "не прошла" : h.status.toLowerCase()}
                    {h.status === "PENDING" && !h.claimedAt && h.provider === "sbp" && <> · <Link className="text-neon underline" href={`/app/billing/sbp/${h.id}`}>оплатить</Link></>}
                    {h.npdReceiptId && <> · <a className="text-neon underline" href={receiptUrl(h.npdReceiptId)} target="_blank" rel="noreferrer">чек</a></>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {plan !== "FREE" && isOwner && (
          <div className="card">
            <h2 className="mb-1 font-semibold">Отмена подписки</h2>
            <p className="mb-3 text-sm text-muted">Тариф продолжит действовать до конца оплаченного периода, затем компания перейдёт на бесплатный тариф.</p>
            <ActionForm action={cancelSubscriptionAction} confirm="Отключить продление тарифа?">
              <input type="hidden" name="companyId" value={company.id} />
              <SubmitButton className="btn-ghost">Отменить подписку</SubmitButton>
            </ActionForm>
          </div>
        )}
      </div>
    </>
  );
}
