import { and, eq } from "drizzle-orm";
import { PageHeader } from "@/components/app/ui";
import { ScanClient, type ScanProgram } from "@/components/app/ScanClient";
import { ALL_ROLES, listPrograms, listRewards, listVenues, requireCompanyContext } from "@/components/app/data";
import { db, schema } from "@/server/db";

export const dynamic = "force-dynamic";

export default async function ScanPage() {
  const { company, user } = await requireCompanyContext(ALL_ROLES);
  const [programs, rewards, venues, mem] = await Promise.all([
    listPrograms(company.id),
    listRewards(company.id),
    listVenues(company.id),
    db.select({ venueId: schema.memberships.venueId }).from(schema.memberships).where(and(eq(schema.memberships.companyId, company.id), eq(schema.memberships.userId, user.id))),
  ]);
  const restrictTo = mem[0]?.venueId ?? null;
  const venueName = new Map(venues.map((v) => [v.id, v.name]));
  const list: ScanProgram[] = programs
    .filter((p) => p.active && (!restrictTo || p.venueId === restrictTo))
    .map((p) => ({
      id: p.id,
      name: p.name,
      type: p.type,
      venueName: venueName.get(p.venueId) ?? "",
      stampsRequired: p.stampsRequired,
      pointsPercent: p.pointsPercent,
      rewardText: p.rewardText,
      rewards: rewards.filter((r) => r.programId === p.id && r.active).map((r) => ({ id: r.id, title: r.title, cost: r.cost })),
    }));
  return (
    <>
      <PageHeader title="Сканер" subtitle="Наведите камеру на QR клиента" />
      <ScanClient companyId={company.id} programs={list} />
    </>
  );
}
