import { PlanGate } from "@/components/app/PlanGate";
import { PageHeader } from "@/components/app/ui";
import { requireCompanyContext } from "@/components/app/data";

export const dynamic = "force-dynamic";

export default async function ExportPage() {
  const { company, limits } = await requireCompanyContext();
  return (
    <>
      <PageHeader title="Экспорт данных" />
      {limits.export ? (
        <div className="card space-y-3">
          <p className="text-sm text-muted">
            Скачайте отдельно бонусные карты клиентов и историю начислений и списаний.
            Файлы CSV открываются в Excel и Google Таблицах.
          </p>
          <div className="flex flex-wrap gap-3">
            <a className="btn-primary" href={`/api/app/export?companyId=${encodeURIComponent(company.id)}&kind=cards`} download>
              Скачать карты
            </a>
            <a className="btn-secondary" href={`/api/app/export?companyId=${encodeURIComponent(company.id)}&kind=transactions`} download>
              Скачать операции
            </a>
          </div>
          <p className="text-xs text-muted">До 50 000 строк на файл. Если данных больше, выгрузка завершится ошибкой без потери записей.</p>
        </div>
      ) : (
        <PlanGate title="Экспорт в CSV" need="TOP">Выгрузка клиентов и операций для вашей бухгалтерии и CRM.</PlanGate>
      )}
    </>
  );
}
