"use client";
import { useState } from "react";
import Link from "next/link";
import { Field } from "./ui";

export function ProgramFields({ pointsAllowed, defaults }: { pointsAllowed: boolean; defaults?: { name?: string; stampsRequired?: number; pointsPercent?: number; rewardText?: string; type?: "STAMPS" | "POINTS" } }) {
  const [type, setType] = useState<"STAMPS" | "POINTS">(defaults?.type ?? "STAMPS");
  return (
    <div className="space-y-4">
      <fieldset>
        <legend className="label">Тип программы</legend>
        <div className="grid grid-cols-2 gap-2">
          <label className={`cursor-pointer rounded-xl border p-3 text-sm ${type === "STAMPS" ? "border-neon bg-neon/10" : "border-line"}`}>
            <input type="radio" name="type" value="STAMPS" checked={type === "STAMPS"} onChange={() => setType("STAMPS")} className="sr-only" />
            <div className="font-semibold">Штампы</div>
            <div className="text-xs text-muted">N покупок — награда</div>
          </label>
          <label className={`rounded-xl border p-3 text-sm ${pointsAllowed ? "cursor-pointer" : "cursor-not-allowed opacity-70"} ${type === "POINTS" ? "border-neon bg-neon/10" : "border-line"}`}>
            <input type="radio" name="type" value="POINTS" checked={type === "POINTS"} disabled={!pointsAllowed} onChange={() => setType("POINTS")} className="sr-only" />
            <div className="font-semibold">Баллы {!pointsAllowed && "🔒"}</div>
            <div className="text-xs text-muted">% от суммы покупки</div>
          </label>
        </div>
        {!pointsAllowed && (
          <p className="mt-2 text-xs text-muted">
            Баллы доступны на тарифах PRO и TOP. <Link href="/app/billing" className="inline-flex min-h-10 items-center text-neon underline underline-offset-4">Улучшить тариф</Link>
          </p>
        )}
      </fieldset>
      <Field label="Название программы"><input className="input" name="name" required minLength={2} maxLength={80} defaultValue={defaults?.name ?? "Бонусная карта"} /></Field>
      {type === "STAMPS" ? (
        <Field label="Штампов до награды"><input className="input" type="number" name="stampsRequired" min={2} max={40} required defaultValue={defaults?.stampsRequired ?? 10} /></Field>
      ) : (
        <Field label="Процент баллов от покупки"><input className="input" type="number" name="pointsPercent" min={1} max={50} required defaultValue={defaults?.pointsPercent ?? 5} /></Field>
      )}
      <Field label="Награда"><input className="input" name="rewardText" required minLength={2} maxLength={120} defaultValue={defaults?.rewardText ?? "Кофе в подарок"} /></Field>
    </div>
  );
}
