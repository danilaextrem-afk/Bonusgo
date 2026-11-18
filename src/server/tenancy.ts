import "server-only";
import { ForbiddenError } from "@/server/errors";
import { requireUser, type User } from "@/server/auth/session";
import { ydb } from "@/server/ydb/client";
import { camel, camelAll, type Company, type Membership } from "@/server/ydb/rows";

export type Role = Membership["role"];

type Row = Record<string, unknown>;

async function activeCompany(id: string): Promise<Company | null> {
  const sql = await ydb();
  const [[c]] = await sql<[Row]>`SELECT * FROM companies WHERE id = ${id} AND deleted_at IS NULL`;
  return c ? camel<Company>(c) : null;
}

export async function getUserCompanies(userId: string): Promise<{ company: Company; role: Role; membership: Membership }[]> {
  const sql = await ydb();
  const [rows] = await sql<[Row]>`SELECT * FROM memberships VIEW idx_user WHERE user_id = ${userId} ORDER BY created_at, id`;
  const memberships = camelAll<Membership>(rows);
  const companies = await Promise.all(memberships.map((m) => activeCompany(m.companyId)));
  const out: { company: Company; role: Role; membership: Membership }[] = [];
  memberships.forEach((membership, i) => {
    const company = companies[i];
    if (company) out.push({ company, role: membership.role, membership });
  });
  return out;
}

/** Membership of a specific user (no session lookup). */
export async function getMembership(userId: string, companyId: string): Promise<{ company: Company; membership: Membership } | null> {
  const sql = await ydb();
  const [[m]] = await sql<[Row]>`SELECT * FROM memberships WHERE company_id = ${companyId} AND user_id = ${userId}`;
  if (!m) return null;
  const company = await activeCompany(companyId);
  return company ? { company, membership: camel<Membership>(m) } : null;
}

export async function requireMembership(companyId: string, roles?: string[]): Promise<{ user: User; company: Company; membership: Membership }> {
  const user = await requireUser();
  if (!companyId) throw new ForbiddenError("Нет доступа к этой компании.");
  const m = await getMembership(user.id, companyId);
  if (!m) throw new ForbiddenError("Нет доступа к этой компании.");
  if (roles && roles.length > 0 && !roles.includes(m.membership.role)) throw new ForbiddenError("Недостаточно прав для этого действия.");
  return { user, company: m.company, membership: m.membership };
}
