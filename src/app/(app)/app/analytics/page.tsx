import Link from "next/link";
import { BarChart } from "@/components/app/BarChart";
import { PlanGate } from "@/components/app/PlanGate";
import { PageHeader, Stat } from "@/components/app/ui";
import { series } from "@/components/app/adapt";
import { requireCompanyContext, sp1 } from "@/components/app/data";
import { getCompanyAnalytics } from "@/server/loyalty/service";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const days = sp1(sp.days) === "7" ? 7 : sp1(sp.days) === "90" ? 90 : 30;
  const { company, limits } = await requireCompanyContext();
  const a = await getCompanyAnalytics(company.id, days);
  return (
    <>
      <PageHeader
        title="Аналитика"
        subtitle={`За последние ${days} дней`}
        actions={
          <div className="flex gap-1">
            {[7, 30, 90].map((d) => (
              <Link key={d} href={`/app/analytics?days=${d}`} className={`rounded-xl border px-3 py-1.5 text-sm ${d === days ? "border-neon text-neon" : "border-line text-muted"}`}>{d} дн.</Link>
            ))}
          </div>
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Клиентов всего" value={a.customersTotal} />
        <Stat label="Активных" value={a.activeCustomers} hint="были визиты за 90 дней" />
        <Stat label="Начислений" value={a.accruals} />
        <Stat label="Списаний" value={a.redemptions} />
      </div>
      <h2 className="mb-3 mt-8 font-semibold">Расширенная аналитика</h2>
      {limits.advancedAnalytics ? (
        <div className="space-y-4">
          <div className="card">
            <h3 className="mb-2 text-sm text-muted">Визиты по дням</h3>
            <BarChart data={series(a.visitsByDay)} title="Визиты по дням" />
          </div>
          <div className="card">
            <h3 className="mb-2 text-sm text-muted">Новые клиенты по дням</h3>
            <BarChart data={series(a.newCustomersByDay)} title="Новые клиенты по дням" />
          </div>
        </div>
      ) : (
        <PlanGate title="Графики визитов и новых клиентов">Смотрите динамику по дням и находите лучшие дни недели.</PlanGate>
      )}
    </>
  );
}
