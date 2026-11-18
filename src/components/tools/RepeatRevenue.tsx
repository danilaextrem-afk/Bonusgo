"use client";
import { currencyOf, type CP } from "@/components/site/site-data";
import { NumField, ShareButton, Stat, ToolShell, fmt, money, num } from "./ui";
import { useUrlState } from "./useUrlState";

const DEFAULTS = { clients: "300", check: "400", cur: "30", target: "40", visits: "2" };

export function RepeatRevenue({ country, shareable = true }: { country: CP; shareable?: boolean }) {
  const cur = currencyOf(country);
  const [s, set] = useUrlState(country === "by" ? { ...DEFAULTS, check: "14" } : DEFAULTS, shareable);
  const clients = num(s.clients);
  const check = num(s.check);
  const current = Math.min(100, num(s.cur));
  const target = Math.min(100, num(s.target));
  const visits = num(s.visits);

  const extraClients = (clients * (target - current)) / 100;
  const month = extraClients * visits * check;
  const year = month * 12;
  const negative = target < current;

  return (
    <ToolShell
      inputs={
        <>
          <NumField label="Клиентов в месяц" value={s.clients} onChange={(v) => set({ clients: v })} />
          <NumField label="Средний чек" suffix={cur === "RUB" ? "₽" : "BYN"} value={s.check} onChange={(v) => set({ check: v })} />
          <NumField label="Сейчас возвращаются" suffix="%" max={100} step="any" value={s.cur} onChange={(v) => set({ cur: v })} />
          <NumField label="Цель по возвращаемости" suffix="%" max={100} step="any" value={s.target} onChange={(v) => set({ target: v })} />
          <NumField label="Визитов вернувшегося клиента в месяц" step="any" value={s.visits} onChange={(v) => set({ visits: v })} hint="Сколько раз в месяц приходит клиент, который вернулся." />
        </>
      }
      results={
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Stat accent label="Дополнительная выручка в месяц" value={money(month, cur)} />
            <Stat accent label="Дополнительная выручка в год" value={money(year, cur)} />
            <Stat label="Дополнительных вернувшихся клиентов" value={fmt(extraClients)} sub="в месяц" />
            <Stat label="Рост доли повторных" value={`${fmt(target - current)} п.п.`} />
          </div>
          {negative && <p className="text-sm text-warn">Цель ниже текущего значения: результат показывает снижение выручки.</p>}
          <p className="text-sm leading-relaxed text-muted">
            Допущения: вернувшиеся клиенты платят средний чек, а число клиентов в месяц не меняется. Это арифметика сценария, а не прогноз и не гарантия результата.
          </p>
          {shareable && <ShareButton />}
        </>
      }
    />
  );
}
