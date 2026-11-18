"use client";
import { useId, useState, type ReactNode } from "react";
import { formatMoney, type CurrencyCode } from "@/lib/plans";

export function num(s: string, fallback = 0): number {
  const v = Number(String(s).replace(",", ".").trim());
  return Number.isFinite(v) && v >= 0 ? v : fallback;
}

export function money(major: number, currency: CurrencyCode): string {
  if (!Number.isFinite(major)) return "—";
  return formatMoney(Math.round(major * 100), currency);
}

const nf = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });
export function fmt(n: number): string {
  return Number.isFinite(n) ? nf.format(n) : "—";
}

export function NumField({
  label,
  value,
  onChange,
  suffix,
  min = 0,
  max,
  step = 1,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  suffix?: string;
  min?: number;
  max?: number;
  step?: number | "any";
  hint?: string;
}) {
  const id = useId();
  return (
    <div>
      <label className="label" htmlFor={id}>{label}</label>
      <div className="relative">
        <input
          id={id}
          className={`input ${suffix ? "pr-14" : ""}`}
          type="number"
          inputMode="decimal"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-describedby={hint ? `${id}-h` : undefined}
        />
        {suffix && <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs text-muted">{suffix}</span>}
      </div>
      {hint && <p id={`${id}-h`} className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function Stat({ label, value, sub, accent = false }: { label: string; value: ReactNode; sub?: string; accent?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 ${accent ? "border-neon/50 bg-neon/5" : "border-line bg-surface-2"}`}>
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${accent ? "glow-text" : "text-text"}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-muted">{sub}</p>}
    </div>
  );
}

export function ToolShell({ inputs, results }: { inputs: ReactNode; results: ReactNode }) {
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
      <div className="card space-y-4">{inputs}</div>
      <div className="card space-y-3" aria-live="polite">{results}</div>
    </div>
  );
}

export function ShareButton() {
  const [state, setState] = useState<"idle" | "ok" | "fail">("idle");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setState("ok");
    } catch {
      setState("fail");
    }
    setTimeout(() => setState("idle"), 2500);
  };
  return (
    <button type="button" onClick={copy} className="btn-ghost min-h-10 !py-2 text-xs">
      {state === "ok" ? "Ссылка скопирована" : state === "fail" ? "Скопируйте адрес из строки браузера" : "Поделиться расчётом"}
    </button>
  );
}
