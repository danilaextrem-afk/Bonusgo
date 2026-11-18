import { ActionForm } from "@/components/app/ActionForm";
import { SubmitButton } from "@/components/app/SubmitButton";
import { VenueFields } from "@/components/app/VenueFields";
import { PageHeader, Empty } from "@/components/app/ui";
import { PlanGate } from "@/components/app/PlanGate";
import { listVenues, requireCompanyContext } from "@/components/app/data";
import { getUsage } from "@/server/limits";
import { createVenueAction, updateVenueAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function VenuesPage() {
  const { company, limits } = await requireCompanyContext();
  const [venues, usage] = await Promise.all([listVenues(company.id), getUsage(company.id)]);
  const canAdd = usage.venues < usage.limits.venues;
  return (
    <>
      <PageHeader title="Заведения" subtitle={`${usage.venues} из ${usage.limits.venues} по тарифу`} />
      <div className="space-y-4">
        {venues.length === 0 && <Empty>Пока нет заведений.</Empty>}
        {venues.map((v) => (
          <details key={v.id} className="card">
            <summary className="flex cursor-pointer items-center gap-3">
              {v.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={v.logoUrl} alt="" className="h-10 w-10 rounded-lg object-cover" />
              ) : (
                <span className="h-10 w-10 rounded-lg" style={{ background: /^#[0-9a-fA-F]{6}$/.test(v.brandColor) ? v.brandColor : "#39FF88" }} />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{v.name}</span>
                <span className="block truncate text-xs text-muted">{v.address || "Адрес не указан"} · /v/{v.slug}</span>
              </span>
              <span className="text-xs text-muted">Изменить</span>
            </summary>
            <ActionForm action={updateVenueAction} className="mt-4 space-y-4 border-t border-line pt-4">
              <input type="hidden" name="companyId" value={company.id} />
              <input type="hidden" name="venueId" value={v.id} />
              <VenueFields canBrand={limits.customBranding} defaults={{ name: v.name, address: v.address, brandColor: v.brandColor, logoUrl: v.logoUrl }} />
              <SubmitButton>Сохранить</SubmitButton>
            </ActionForm>
          </details>
        ))}
        {canAdd ? (
          <div className="card">
            <h2 className="mb-3 font-semibold">Добавить заведение</h2>
            <ActionForm action={createVenueAction} className="space-y-4" resetOnOk>
              <input type="hidden" name="companyId" value={company.id} />
              <VenueFields canBrand={limits.customBranding} />
              <SubmitButton>Создать</SubmitButton>
            </ActionForm>
          </div>
        ) : (
          <PlanGate title="Достигнут лимит заведений" need="TOP">
            На вашем тарифе доступно заведений: {usage.limits.venues}.
          </PlanGate>
        )}
      </div>
    </>
  );
}
