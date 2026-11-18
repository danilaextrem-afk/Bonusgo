"use client";
import { PLAN_LIMITS, PLAN_PRICES, type PlanId } from "@/lib/plans";
import { codeOf, currencyOf, type CP } from "@/components/site/site-data";
import { NumField, ShareButton, Stat, ToolShell, money, num } from "./ui";
import { useUrlState } from "./useUrlState";

export function ProgramCost({ country, shareable = true }: { country: CP; shareable?: boolean }) {
  const cur = currencyOf(country);
  const defaults = { clients: "150", visits: "3", check: country === "ru" ? "350" : "12", reward: "8", fresh: "40", print: country === "ru" ? "5" : "0.3", lost: "15" };
  const [s, set] = useUrlState(defaults, shareable);
  const clients = num(s.clients);
  const rewards = (clients * num(s.visits) * num(s.check) * Math.min(100, num(s.reward))) / 100;

  const order: PlanId[] = ["FREE", "PRO", "TOP"];
  const plan = order.find((p) => clients <= PLAN_LIMITS[p].activeCustomers) ?? null;
  const planPrice = plan && plan !== "FREE" ? PLAN_PRICES[codeOf(country)][plan] / 100 : 0;
  const paper = num(s.fresh) * num(s.print) * (1 + Math.min(100, num(s.lost)) / 100);
  const digitalTotal = rewards + planPrice;
  const paperTotal = rewards + paper;
  const diff = paper - planPrice;

  return (
    <ToolShell
      inputs={
        <>
          <NumField label="Активных клиентов с картой" value={s.clients} onChange={(v) => set({ clients: v })} hint="Активный клиент — с активностью за последние 90 дней." />
          <NumField label="Визитов клиента в месяц" step="any" value={s.visits} onChange={(v) => set({ visits: v })} />
          <NumField label="Средний чек" suffix={cur === "RUB" ? "₽" : "BYN"} value={s.check} onChange={(v) => set({ check: v })} />
          <NumField label="Доля награды от выручки" suffix="%" max={100} step="any" value={s.reward} onChange={(v) => set({ reward: v })} hint="Эффективную скидку можно посчитать в калькуляторе программы лояльности." />
          <NumField label="Новых клиентов в месяц" value={s.fresh} onChange={(v) => set({ fresh: v })} />
          <NumField label="Стоимость печати одной бумажной карты" suffix={cur === "RUB" ? "₽" : "BYN"} step="any" value={s.print} onChange={(v) => set({ print: v })} />
          <NumField label="Потерянные и перевыпущенные карты" suffix="%" max={100} step="any" value={s.lost} onChange={(v) => set({ lost: v })} />
        </>
      }
      results={
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Stat label="Награды в месяц" value={money(rewards, cur)} sub="одинаково для любого формата карты" />
            <Stat accent label={plan ? `Тариф QRonus: ${plan === "FREE" ? "бесплатный" : plan}` : "Тариф QRonus"} value={plan ? money(planPrice, cur) : "по запросу"} sub={plan ? "в месяц" : "клиентов больше лимита тарифа TOP"} />
            <Stat label="Бумажные карты в месяц" value={money(paper, cur)} sub="печать с учётом потерь" />
            <Stat label="Итого: цифровая карта" value={plan ? money(digitalTotal, cur) : "—"} sub={`бумажная: ${money(paperTotal, cur)}`} />
          </div>
          {plan && (
            <p className="text-sm leading-relaxed text-muted">
              {diff >= 0
                ? `Бумажные карты дороже тарифа на ${money(diff, cur)} в месяц.`
                : `Тариф дороже печати бумажных карт на ${money(-diff, cur)} в месяц; за эту разницу вы получаете учёт клиентов, подтверждение начислений сотрудником и аналитику.`}{" "}
              Налоги и комиссии платёжных систем не учтены.
            </p>
          )}
          {shareable && <ShareButton />}
        </>
      }
    />
  );
}
