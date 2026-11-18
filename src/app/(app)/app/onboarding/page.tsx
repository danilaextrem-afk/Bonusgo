import Link from "next/link";
import { ActionForm } from "@/components/app/ActionForm";
import { ProgramFields } from "@/components/app/ProgramFields";
import { QrImage } from "@/components/app/QrImage";
import { SubmitButton } from "@/components/app/SubmitButton";
import { VenueFields } from "@/components/app/VenueFields";
import { Field, PageHeader } from "@/components/app/ui";
import { getAppContext, listPrograms, listVenues, sp1 } from "@/components/app/data";
import { appUrl } from "@/components/app/safe";
import { PLAN_LIMITS } from "@/lib/plans";
import { effectivePlan } from "@/server/limits";
import { createCompanyAction, createProgramAction, createVenueAction } from "../actions";

export const dynamic = "force-dynamic";

const STEPS = ["Компания", "Заведение", "Программа", "Готово"];

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const { current } = await getAppContext();
  const forceNew = sp1(sp.new) === "1";

  let step = 1;
  let venues: Awaited<ReturnType<typeof listVenues>> = [];
  let programs: Awaited<ReturnType<typeof listPrograms>> = [];
  if (current && !forceNew) {
    [venues, programs] = await Promise.all([listVenues(current.company.id), listPrograms(current.company.id)]);
    step = venues.length === 0 ? 2 : programs.length === 0 ? 3 : 4;
  }
  const company = current?.company;
  const plan = company ? await effectivePlan(company) : "FREE";
  const limits = PLAN_LIMITS[plan];

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Настройка за 3 минуты" subtitle={`Шаг ${step} из 4: ${STEPS[step - 1]}`} />
      <ol className="mb-6 flex gap-2" aria-label="Шаги">
        {STEPS.map((s, i) => (
          <li key={s} aria-current={i + 1 === step ? "step" : undefined} className={`h-1.5 flex-1 rounded-full ${i + 1 <= step ? "bg-neon" : "bg-surface-2"}`} title={s} />
        ))}
      </ol>

      {step === 1 && (
        <div className="card">
          <ActionForm action={createCompanyAction} className="space-y-4">
            <Field label="Название компании или бренда"><input className="input" name="name" required minLength={2} maxLength={80} placeholder="Кофейня «Зерно»" /></Field>
            <Field label="Страна">
              <select className="input" name="country" defaultValue="RU">
                <option value="RU">Россия</option>
                <option value="BY">Беларусь</option>
              </select>
            </Field>
            <Field label="ИНН (Россия) или УНП (Беларусь) — необязательно"><input className="input" name="taxId" inputMode="numeric" maxLength={12} /></Field>
            <SubmitButton className="btn-primary w-full">Далее</SubmitButton>
          </ActionForm>
        </div>
      )}

      {step === 2 && company && (
        <div className="card">
          <ActionForm action={createVenueAction} className="space-y-4">
            <input type="hidden" name="companyId" value={company.id} />
            <input type="hidden" name="next" value="/app/onboarding" />
            <VenueFields canBrand={limits.customBranding} />
            <SubmitButton className="btn-primary w-full">Далее</SubmitButton>
          </ActionForm>
        </div>
      )}

      {step === 3 && company && (
        <div className="card">
          <ActionForm action={createProgramAction} className="space-y-4">
            <input type="hidden" name="companyId" value={company.id} />
            <input type="hidden" name="venueId" value={venues[0].id} />
            <input type="hidden" name="next" value="/app/onboarding" />
            <ProgramFields pointsAllowed={limits.pointsPrograms} />
            <SubmitButton className="btn-primary w-full">Создать программу</SubmitButton>
          </ActionForm>
        </div>
      )}

      {step === 4 && company && venues[0] && (
        <div className="card text-center">
          <h2 className="text-xl font-bold glow-text">Всё готово!</h2>
          <p className="mt-2 text-sm text-muted">Покажите этот QR гостям. Они отсканируют его камерой и получат карту.</p>
          <div className="mt-4 flex justify-center"><QrImage text={`${appUrl()}/v/${venues[0].slug}`} label={`QR-код заведения ${venues[0].name}`} /></div>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Link href={`/api/app/poster?venueId=${venues[0].id}&format=a4`} className="btn-ghost">Скачать плакат A4</Link>
            <Link href={`/api/app/poster?venueId=${venues[0].id}&format=png`} className="btn-ghost">Скачать PNG</Link>
            <Link href="/app" className="btn-primary">В панель</Link>
          </div>
        </div>
      )}
    </div>
  );
}
