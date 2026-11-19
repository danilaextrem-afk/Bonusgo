import Link from "next/link";
import { PLAN_LIMITS, PLAN_PRICES, formatMoney, type PlanId } from "@/lib/plans";
import { Icon } from "./icons";
import { codeOf, currencyOf, paymentNote, planRows, registerHref, type CP } from "./site-data";

const PLANS: { id: PlanId; name: string; tagline: string; highlight?: boolean }[] = [
  { id: "FREE", name: "Бесплатный", tagline: "Чтобы попробовать и запустить первую карту" },
  { id: "PRO", name: "PRO", tagline: "Для одной точки с постоянными клиентами", highlight: true },
  { id: "TOP", name: "TOP", tagline: "Для сети точек и расширенных возможностей" },
];

export function priceLabel(cp: CP, plan: PlanId): string {
  if (plan === "FREE") return formatMoney(0, currencyOf(cp));
  return formatMoney(PLAN_PRICES[codeOf(cp)][plan], currencyOf(cp));
}

export function PricingCards({ country }: { country: CP }) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {PLANS.map((p) => {
        const limits = PLAN_LIMITS[p.id];
        return (
          <article key={p.id} className={`card flex flex-col ${p.highlight ? "border-neon/60 shadow-[0_0_40px_-12px_rgba(57,255,136,0.35)]" : ""}`}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-text">{p.name}</h3>
              {p.highlight && <span className="badge">Популярный</span>}
            </div>
            <p className="mt-1 text-sm text-muted">{p.tagline}</p>
            <p className="mt-5 flex items-baseline gap-1.5">
              <span className="text-3xl font-bold text-text">{priceLabel(country, p.id)}</span>
              <span className="text-sm text-muted">{p.id === "FREE" ? "навсегда" : "в месяц"}</span>
            </p>
            <ul className="mt-5 flex-1 space-y-2 text-sm text-muted">
              <li className="flex gap-2"><Icon name="check" size={16} className="mt-0.5 shrink-0 text-neon" />До {new Intl.NumberFormat("ru-RU").format(limits.activeCustomers)} активных клиентов</li>
              <li className="flex gap-2"><Icon name="check" size={16} className="mt-0.5 shrink-0 text-neon" />Программ лояльности: {limits.programs}</li>
              <li className="flex gap-2"><Icon name="check" size={16} className="mt-0.5 shrink-0 text-neon" />Заведений: {limits.venues}</li>
              {limits.staff > 0 && <li className="flex gap-2"><Icon name="check" size={16} className="mt-0.5 shrink-0 text-neon" />Сотрудников: {limits.staff}</li>}
              {limits.advancedAnalytics && <li className="flex gap-2"><Icon name="check" size={16} className="mt-0.5 shrink-0 text-neon" />Расширенная аналитика</li>}
              {limits.automation && <li className="flex gap-2"><Icon name="check" size={16} className="mt-0.5 shrink-0 text-neon" />Автоматизация и экспорт</li>}
            </ul>
            <Link href={registerHref(country, p.id === "FREE" ? { role: "business" } : { role: "business", plan: p.id })} className={`${p.highlight ? "btn-primary" : "btn-ghost"} mt-6`}>
              {p.id === "FREE" ? "Начать бесплатно" : `Купить ${p.name} — перейти к регистрации`}
            </Link>
          </article>
        );
      })}
    </div>
  );
}

export function PricingTable({ country }: { country: CP }) {
  const rows = planRows();
  return (
    <div className="overflow-x-auto rounded-[18px] border border-line bg-surface">
      <table className="w-full min-w-[560px] border-collapse text-left text-sm">
        <caption className="sr-only">Сравнение тарифов QRonus</caption>
        <thead>
          <tr className="border-b border-line bg-surface-2">
            <th scope="col" className="px-4 py-3 font-semibold text-muted">Возможность</th>
            {PLANS.map((p) => (
              <th key={p.id} scope="col" className="px-4 py-3 font-semibold text-text">
                {p.name}
                <span className="block text-xs font-normal text-neon">{priceLabel(country, p.id)}{p.id === "FREE" ? "" : " / мес"}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-b border-line last:border-0">
              <th scope="row" className="px-4 py-3 font-medium text-muted">{r.label}</th>
              {PLANS.map((p) => {
                const v = r.get(p.id);
                return (
                  <td key={p.id} className={`px-4 py-3 ${v === "—" ? "text-[#5d676e]" : "text-text"}`}>
                    {v === "—" ? <span aria-label="нет">—</span> : v}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PaymentNote({ country }: { country: CP }) {
  return (
    <div className="rounded-[18px] border border-warn/40 bg-warn/5 p-5 text-sm leading-relaxed text-text">
      <p className="font-semibold text-warn">Способ оплаты</p>
      <p className="mt-1 text-muted">{paymentNote(country)}.</p>
      <p className="mt-2 text-muted">Бесплатный тариф доступен без оплаты и без привязки карты.</p>
      <p className="mt-2 text-muted">Как купить: выберите тариф → зарегистрируйтесь или войдите → откройте «Тариф и оплата» в кабинете → выберите срок и итоговую цену → нажмите «Оплатить». Если касса не подключена, сайт покажет сообщение о недоступности оплаты.</p>
      <p className="mt-2 text-muted">При оплате через Platega максимальная сумма одной транзакции — 10 000 ₽. Для некоторых длительных периодов покупки через этот способ временно недоступны.</p>
    </div>
  );
}
