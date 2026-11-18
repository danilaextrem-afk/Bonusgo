import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader, Stat, Notice } from "@/components/app/ui";
import { UsageBar } from "@/components/app/UsageBar";
import { requireCompanyContext } from "@/components/app/data";
import { isDemoMode } from "@/components/app/safe";
import { getUsage } from "@/server/limits";
import { getCompanyAnalytics } from "@/server/loyalty/service";
import { listPrograms, listVenues } from "@/components/app/data";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { company, role, plan } = await requireCompanyContext(["OWNER", "MANAGER", "STAFF"]);
  if (role === "STAFF") redirect("/app/scan");
  const [usage, stats, venues, programs] = await Promise.all([
    getUsage(company.id),
    getCompanyAnalytics(company.id, 30),
    listVenues(company.id),
    listPrograms(company.id),
  ]);
  const steps = [
    { done: venues.length > 0, label: "Создайте заведение", href: "/app/venues" },
    { done: programs.length > 0, label: "Настройте бонусную программу", href: "/app/programs" },
    { done: stats.customersTotal > 0, label: "Получите первого клиента: распечатайте QR", href: "/app/qr" },
  ];
  const incomplete = steps.some((s) => !s.done);
  return (
    <>
      <PageHeader title={company.name} subtitle="Обзор за последние 30 дней" actions={<Link href="/app/scan" className="btn-primary">Открыть сканер</Link>} />
      {isDemoMode() && <div className="mb-4"><Notice tone="warn">Тестовый режим: не вводите реальные персональные данные</Notice></div>}
      {incomplete && (
        <div className="card mb-4">
          <h2 className="mb-3 font-semibold">Быстрый старт</h2>
          <ol className="space-y-2 text-sm">
            {steps.map((s) => (
              <li key={s.href} className="flex items-center gap-2">
                <span className={s.done ? "text-neon" : "text-muted"}>{s.done ? "✓" : "○"}</span>
                {s.done ? <span className="text-muted line-through">{s.label}</span> : <Link href={s.href} className="underline underline-offset-4">{s.label}</Link>}
              </li>
            ))}
          </ol>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Клиентов" value={stats.customersTotal} />
        <Stat label="Активных" value={stats.activeCustomers} hint="за 90 дней" />
        <Stat label="Начислений" value={stats.accruals} />
        <Stat label="Списаний" value={stats.redemptions} />
      </div>
      <div className="card mt-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Использование тарифа</h2>
          <Link href="/app/billing" className="text-sm text-neon underline underline-offset-4">{plan === "TOP" ? "Тариф" : "Улучшить"}</Link>
        </div>
        <UsageBar label="Заведения" used={usage.venues} limit={usage.limits.venues} />
        <UsageBar label="Программы" used={usage.programs} limit={usage.limits.programs} />
        <UsageBar label="Активные клиенты" used={usage.activeCustomers} limit={usage.limits.activeCustomers} />
        <UsageBar label="Сотрудники" used={usage.staff} limit={usage.limits.staff} />
      </div>
    </>
  );
}
