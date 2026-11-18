"use client";
import { currencyOf, type CP } from "@/components/site/site-data";
import { NumField, ShareButton, Stat, ToolShell, fmt, money, num } from "./ui";
import { useUrlState } from "./useUrlState";

const DEFAULTS = { check: "350", visits: "3", clients: "200", type: "nth", value: "10" };

export function LoyaltyCalculator({ country, shareable = true }: { country: CP; shareable?: boolean }) {
  const cur = currencyOf(country);
  const [s, set] = useUrlState(country === "by" ? { ...DEFAULTS, check: "12" } : DEFAULTS, shareable);
  const check = num(s.check);
  const visits = num(s.visits);
  const clients = num(s.clients);
  const nth = s.type !== "points";
  const value = num(s.value);

  const revenue = check * visits * clients;
  const N = Math.max(2, Math.round(value));
  const pct = Math.min(100, value);
  const discount = nth ? 100 / N : pct;
  const cost = nth ? revenue / N : (revenue * pct) / 100;
  const rewards = nth ? (clients * visits) / N : 0;
  const recN = Math.min(12, Math.max(5, Math.round(visits * 1.75)));
  const recDiscount = 100 / recN;
  const verdict = discount === 0 ? "Укажите значение награды." : discount > 15 ? "Высокая нагрузка на маржу: проверьте, что награда не съедает прибыль." : discount >= 4 ? "Нагрузка в типичном для малого бизнеса диапазоне, проверьте её по своей марже." : "Скидка небольшая: клиенту может не хватить стимула возвращаться.";

  return (
    <ToolShell
      inputs={
        <>
          <NumField label="Средний чек" suffix={cur === "RUB" ? "₽" : "BYN"} value={s.check} onChange={(v) => set({ check: v })} />
          <NumField label="Визитов клиента в месяц" step="any" value={s.visits} onChange={(v) => set({ visits: v })} />
          <NumField label="Клиентов в месяц" value={s.clients} onChange={(v) => set({ clients: v })} />
          <div>
            <label className="label" htmlFor="lc-type">Тип награды</label>
            <select id="lc-type" className="input" value={nth ? "nth" : "points"} onChange={(e) => set({ type: e.target.value, value: e.target.value === "nth" ? "10" : "5" })}>
              <option value="nth">Каждый N-й визит бесплатно</option>
              <option value="points">Процент от чека баллами</option>
            </select>
          </div>
          <NumField label={nth ? "N (каждый N-й бесплатно)" : "Возврат баллами"} suffix={nth ? "шт." : "%"} min={nth ? 2 : 0} max={nth ? 100 : 100} step={nth ? 1 : "any"} value={s.value} onChange={(v) => set({ value: v })} />
        </>
      }
      results={
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Stat accent label="Эффективная скидка" value={`${fmt(discount)}%`} />
            <Stat label="Награды в месяц" value={money(cost, cur)} sub={nth ? `около ${fmt(rewards)} наград в месяц` : "потолок при использовании всех баллов"} />
            <Stat label="Выручка от этих клиентов" value={money(revenue, cur)} sub="в месяц" />
            <Stat label="Рекомендуемое N" value={recN} sub={`скидка ${fmt(recDiscount)}%, награда за 6–8 недель`} />
          </div>
          <p className="text-sm leading-relaxed text-muted">{verdict} Расчёт ведётся по цене продажи; по себестоимости расходы ниже.</p>
          {shareable && <ShareButton />}
        </>
      }
    />
  );
}
