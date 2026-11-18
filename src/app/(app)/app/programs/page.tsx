import { ActionForm } from "@/components/app/ActionForm";
import { PlanGate } from "@/components/app/PlanGate";
import { ProgramFields } from "@/components/app/ProgramFields";
import { SubmitButton } from "@/components/app/SubmitButton";
import { Empty, Field, PageHeader } from "@/components/app/ui";
import { listPrograms, listRewards, listVenues, requireCompanyContext } from "@/components/app/data";
import { getUsage } from "@/server/limits";
import { createProgramAction, createRewardAction, deactivateRewardAction, updateProgramAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function ProgramsPage() {
  const { company, limits, plan } = await requireCompanyContext();
  const [programs, rewards, venues, usage] = await Promise.all([listPrograms(company.id), listRewards(company.id), listVenues(company.id), getUsage(company.id)]);
  const venueName = new Map(venues.map((v) => [v.id, v.name]));
  const canAdd = venues.length > 0 && usage.programs < usage.limits.programs;
  return (
    <>
      <PageHeader title="Программы лояльности" subtitle={`${usage.programs} из ${usage.limits.programs} по тарифу`} />
      <div className="space-y-4">
        {programs.length === 0 && <Empty>Программ пока нет. Создайте первую ниже.</Empty>}
        {programs.map((p) => {
          const pr = rewards.filter((r) => r.programId === p.id && r.active);
          return (
            <details key={p.id} className="card">
              <summary className="flex cursor-pointer items-center gap-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{p.name} {!p.active && <span className="text-xs text-warn">(выключена)</span>}</span>
                  <span className="block truncate text-xs text-muted">
                    {venueName.get(p.venueId) ?? "—"} · {p.type === "STAMPS" ? `${p.stampsRequired} штампов → ${p.rewardText}` : `${p.pointsPercent}% баллами · ${p.rewardText}`}
                  </span>
                </span>
                <span className="badge">{p.type === "STAMPS" ? "Штампы" : "Баллы"}</span>
              </summary>
              <div className="mt-4 space-y-6 border-t border-line pt-4">
                <ActionForm action={updateProgramAction} className="space-y-4">
                  <input type="hidden" name="companyId" value={company.id} />
                  <input type="hidden" name="programId" value={p.id} />
                  <Field label="Название"><input className="input" name="name" required minLength={2} maxLength={80} defaultValue={p.name} /></Field>
                  {p.type === "STAMPS" ? (
                    <Field label="Штампов до награды"><input className="input" type="number" name="stampsRequired" min={2} max={40} defaultValue={p.stampsRequired} required /></Field>
                  ) : (
                    <Field label="Процент баллов"><input className="input" type="number" name="pointsPercent" min={1} max={50} defaultValue={p.pointsPercent} required /></Field>
                  )}
                  <Field label="Награда"><input className="input" name="rewardText" required minLength={2} maxLength={120} defaultValue={p.rewardText} /></Field>
                  <label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={p.active} className="h-4 w-4 accent-[#39ff88]" /> Программа активна</label>
                  <SubmitButton>Сохранить</SubmitButton>
                </ActionForm>

                <div>
                  <h3 className="mb-2 font-semibold">Награды</h3>
                  {!limits.rewards ? (
                    <PlanGate title="Каталог наград">Несколько наград с разной стоимостью — на платных тарифах.</PlanGate>
                  ) : (
                    <>
                      <ul className="mb-3 space-y-2">
                        {pr.length === 0 && <li className="text-sm text-muted">Наград пока нет.</li>}
                        {pr.map((r) => (
                          <li key={r.id} className="flex items-center justify-between gap-2 rounded-xl border border-line px-3 py-2 text-sm">
                            <span>{r.title} · {r.cost} {p.type === "STAMPS" ? "штамп." : "баллов"}</span>
                            <ActionForm action={deactivateRewardAction} confirm="Скрыть награду?">
                              <input type="hidden" name="companyId" value={company.id} />
                              <input type="hidden" name="rewardId" value={r.id} />
                              <SubmitButton className="min-h-10 px-2 text-xs text-danger underline">Убрать</SubmitButton>
                            </ActionForm>
                          </li>
                        ))}
                      </ul>
                      <ActionForm action={createRewardAction} className="grid gap-3 sm:grid-cols-[1fr_8rem_auto] sm:items-end" resetOnOk>
                        <input type="hidden" name="companyId" value={company.id} />
                        <input type="hidden" name="programId" value={p.id} />
                        <Field label="Награда"><input className="input" name="title" required minLength={2} maxLength={80} /></Field>
                        <Field label="Стоимость"><input className="input" type="number" name="cost" min={1} required /></Field>
                        <SubmitButton>Добавить</SubmitButton>
                      </ActionForm>
                    </>
                  )}
                </div>
              </div>
            </details>
          );
        })}

        {venues.length === 0 ? (
          <Empty>Сначала создайте заведение в разделе «Заведения».</Empty>
        ) : canAdd ? (
          <div className="card">
            <h2 className="mb-3 font-semibold">Новая программа</h2>
            <ActionForm action={createProgramAction} className="space-y-4" resetOnOk>
              <input type="hidden" name="companyId" value={company.id} />
              <Field label="Заведение">
                <select className="input" name="venueId" required>
                  {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </Field>
              <ProgramFields pointsAllowed={limits.pointsPrograms} />
              <SubmitButton>Создать программу</SubmitButton>
            </ActionForm>
          </div>
        ) : (
          <PlanGate title="Достигнут лимит программ" need={plan === "FREE" ? "PRO" : "TOP"}>На вашем тарифе доступно программ: {usage.limits.programs}.</PlanGate>
        )}
      </div>
    </>
  );
}
