import "server-only";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { ForbiddenError } from "@/server/errors";
import { requireUser, type User } from "@/server/auth/session";

type Company = typeof schema.companies.$inferSelect;
type Membership = typeof schema.memberships.$inferSelect;
export type Role = Membership["role"];

export async function getUserCompanies(userId: string): Promise<{ company: Company; role: Role; membership: Membership }[]> {
  const rows = await db
    .select({ company: schema.companies, membership: schema.memberships })
    .from(schema.memberships)
    .innerJoin(schema.companies, eq(schema.companies.id, schema.memberships.companyId))
    .where(and(eq(schema.memberships.userId, userId), isNull(schema.companies.deletedAt)))
    .orderBy(asc(schema.memberships.createdAt));
  return rows.map((r) => ({ company: r.company, role: r.membership.role, membership: r.membership }));
}

/** Membership of a specific user (no session lookup). */
export async function getMembership(userId: string, companyId: string): Promise<{ company: Company; membership: Membership } | null> {
  const rows = await db
    .select({ company: schema.companies, membership: schema.memberships })
    .from(schema.memberships)
    .innerJoin(schema.companies, eq(schema.companies.id, schema.memberships.companyId))
    .where(and(eq(schema.memberships.userId, userId), eq(schema.memberships.companyId, companyId), isNull(schema.companies.deletedAt)))
    .limit(1);
  return rows[0] ?? null;
}

export async function requireMembership(companyId: string, roles?: string[]): Promise<{ user: User; company: Company; membership: Membership }> {
  const user = await requireUser();
  if (!companyId) throw new ForbiddenError("Нет доступа к этой компании.");
  const m = await getMembership(user.id, companyId);
  if (!m) throw new ForbiddenError("Нет доступа к этой компании.");
  if (roles && roles.length > 0 && !roles.includes(m.membership.role)) throw new ForbiddenError("Недостаточно прав для этого действия.");
  return { user, company: m.company, membership: m.membership };
}
