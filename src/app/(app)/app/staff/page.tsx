import { eq } from "drizzle-orm";
import { ActionForm } from "@/components/app/ActionForm";
import { PlanGate } from "@/components/app/PlanGate";
import { SubmitButton } from "@/components/app/SubmitButton";
import { Empty, Field, PageHeader } from "@/components/app/ui";
import { listVenues, requireCompanyContext } from "@/components/app/data";
import { db, schema } from "@/server/db";
import { getUsage } from "@/server/limits";
import { addStaffAction, removeStaffAction } from "../actions";

export const dynamic = "force-dynamic";
const ROLE = { OWNER: "Владелец", MANAGER: "Менеджер", STAFF: "Кассир" } as const;

export default async function StaffPage() {
  const { company, limits, role } = await requireCompanyContext();
  const [members, venues, usage] = await Promise.all([
    db
      .select({ id: schema.memberships.id, role: schema.memberships.role, venueId: schema.memberships.venueId, email: schema.users.email, name: schema.users.name })
      .from(schema.memberships)
      .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
      .where(eq(schema.memberships.companyId, company.id)),
    listVenues(company.id),
    getUsage(company.id),
  ]);
  const venueName = new Map(venues.map((v) => [v.id, v.name]));
  const isOwner = role === "OWNER";
  const canAdd = limits.staff > 0 && usage.staff < usage.limits.staff;
  return (
    <>
      <PageHeader title="Сотрудники" subtitle={limits.staff > 0 ? `${usage.staff} из ${usage.limits.staff} по тарифу` : undefined} />
      <div className="space-y-4">
        {members.length === 0 ? (
          <Empty>Сотрудников нет.</Empty>
        ) : (
          <div className="card divide-y divide-line !p-0">
            {members.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="truncate font-medium">{m.name || m.email}</div>
                  <div className="truncate text-xs text-muted">{m.email} · {ROLE[m.role]}{m.venueId ? ` · ${venueName.get(m.venueId) ?? "заведение"}` : ""}</div>
                </div>
                {isOwner && m.role !== "OWNER" && (
                  <ActionForm action={removeStaffAction} confirm="Убрать сотрудника из компании?">
                    <input type="hidden" name="companyId" value={company.id} />
                    <input type="hidden" name="membershipId" value={m.id} />
                    <SubmitButton className="min-h-10 px-2 text-xs text-danger underline">Убрать</SubmitButton>
                  </ActionForm>
                )}
              </div>
            ))}
          </div>
        )}
        {!isOwner ? null : limits.staff <= 0 ? (
          <PlanGate title="Сотрудники и кассиры">Добавляйте кассиров, которые начисляют бонусы со своего телефона.</PlanGate>
        ) : !canAdd ? (
          <PlanGate title="Достигнут лимит сотрудников" need="TOP">На вашем тарифе доступно сотрудников: {usage.limits.staff}.</PlanGate>
        ) : (
          <div className="card">
            <h2 className="mb-1 font-semibold">Добавить сотрудника</h2>
            <p className="mb-3 text-xs text-muted">Человек должен сначала зарегистрироваться в QRonus с этим email.</p>
            <ActionForm action={addStaffAction} className="space-y-4" resetOnOk>
              <input type="hidden" name="companyId" value={company.id} />
              <Field label="Email"><input className="input" type="email" name="email" required /></Field>
              <Field label="Роль">
                <select className="input" name="role" defaultValue="STAFF">
                  <option value="STAFF">Кассир (только сканер)</option>
                  <option value="MANAGER">Менеджер</option>
                </select>
              </Field>
              {venues.length > 1 && (
                <Field label="Заведение">
                  <select className="input" name="venueId" defaultValue="">
                    <option value="">Все заведения</option>
                    {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </Field>
              )}
              <SubmitButton>Добавить</SubmitButton>
            </ActionForm>
          </div>
        )}
      </div>
    </>
  );
}
