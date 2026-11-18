import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { requireUser } from "@/server/auth/session";
import { getUserCompanies, requireMembership } from "@/server/tenancy";
import { effectivePlan } from "@/server/limits";
import { PLAN_LIMITS, type PlanId, type PlanLimits } from "@/lib/plans";

export const COMPANY_COOKIE = "bg_company";
export const REF_COOKIE = "bg_ref";
export type Role = "OWNER" | "MANAGER" | "STAFF";
export const MANAGE: Role[] = ["OWNER", "MANAGER"];
export const ALL_ROLES: Role[] = ["OWNER", "MANAGER", "STAFF"];

export const getAppContext = cache(async () => {
  const user = await requireUser();
  const memberships = await getUserCompanies(user.id);
  const jar = await cookies();
  const wanted = jar.get(COMPANY_COOKIE)?.value;
  const current = memberships.find((m) => m.company.id === wanted) ?? memberships[0] ?? null;
  return { user, memberships, current };
});

/** For pages: current company, redirecting to onboarding / scan when appropriate. */
export async function requireCompanyContext(roles: Role[] = MANAGE) {
  const ctx = await getAppContext();
  if (!ctx.current) redirect("/app/onboarding");
  const role = ctx.current.role as Role;
  if (!roles.includes(role)) redirect("/app/scan");
  const company = ctx.current.company;
  const plan = (await effectivePlan(company)) as PlanId;
  return { user: ctx.user, company, role, plan, limits: PLAN_LIMITS[plan] as PlanLimits };
}

/** For server actions: re-verifies membership using the companyId from the form. */
export async function actionCtx(companyId: string, roles: Role[] = MANAGE) {
  if (!companyId) throw new Error("companyId required");
  const m = await requireMembership(companyId, roles);
  const plan = (await effectivePlan(m.company)) as PlanId;
  return { user: m.user, company: m.company, membership: m.membership, plan, limits: PLAN_LIMITS[plan] as PlanLimits };
}

export async function setCompanyCookie(id: string) {
  const jar = await cookies();
  jar.set(COMPANY_COOKIE, id, { httpOnly: true, sameSite: "lax", path: "/", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 365 });
}

// Own-tenant listings (always filtered by a companyId that was verified through membership).
export function listVenues(companyId: string) {
  return db.select().from(schema.venues).where(eq(schema.venues.companyId, companyId)).orderBy(asc(schema.venues.createdAt));
}
export function listPrograms(companyId: string) {
  return db.select().from(schema.programs).where(eq(schema.programs.companyId, companyId)).orderBy(asc(schema.programs.createdAt));
}
export function listRewards(companyId: string) {
  return db.select().from(schema.rewards).where(eq(schema.rewards.companyId, companyId)).orderBy(asc(schema.rewards.cost));
}

export function sp1(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" ? v : undefined;
}
