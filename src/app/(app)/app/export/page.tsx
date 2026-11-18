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
          <p className="text-sm text-muted">Скачайте клиентов и операции в формате CSV — файл откроется в Excel и Google Таблицах.</p>
          <a className="btn-primary" href={`/api/app/export?companyId=${encodeURIComponent(company.id)}`} download>Скачать CSV</a>
        </div>
      ) : (
        <PlanGate title="Экспорт в CSV" need="TOP">Выгрузка клиентов и операций для вашей бухгалтерии и CRM.</PlanGate>
      )}
    </>
  );
}
