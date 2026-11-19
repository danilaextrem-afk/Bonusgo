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
          <p className="text-xs text-muted">
            Полная выгрузка ограничена 50 000 строками. Если данных больше, скачайте
            отдельные месяцы или дни — соседние периоды не пересекаются (время UTC).
          </p>

          <div className="border-t border-line pt-4 space-y-3">
            <h2 className="font-semibold">Выгрузка за период</h2>
            <p className="text-sm text-muted">
              Выберите месяц или конкретный день. Каждый файл содержит не более 50 000 строк.
            </p>
            <form action="/api/app/export" method="get" className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="companyId" value={company.id} />
              <label className="space-y-1 text-sm">
                <span className="block">Месяц (UTC)</span>
                <input className="input" name="period" type="month" required min="2000-01" max="9998-12" />
              </label>
              <button className="btn-secondary" type="submit" name="kind" value="cards">Карты за месяц</button>
              <button className="btn-secondary" type="submit" name="kind" value="transactions">Операции за месяц</button>
            </form>
            <form action="/api/app/export" method="get" className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="companyId" value={company.id} />
              <label className="space-y-1 text-sm">
                <span className="block">День (UTC)</span>
                <input className="input" name="period" type="date" required min="2000-01-01" max="9998-12-31" />
              </label>
              <button className="btn-secondary" type="submit" name="kind" value="cards">Карты за день</button>
              <button className="btn-secondary" type="submit" name="kind" value="transactions">Операции за день</button>
            </form>
          </div>
        </div>
      ) : (
        <PlanGate title="Экспорт в CSV" need="TOP">Выгрузка клиентов и операций для вашей бухгалтерии и CRM.</PlanGate>
      )}
    </>
  );
}
