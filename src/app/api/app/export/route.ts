import { z } from "zod";
import { PLAN_LIMITS, type PlanId } from "@/lib/plans";
import { AppError } from "@/server/errors";
import { getCurrentUser } from "@/server/auth/session";
import { effectivePlan } from "@/server/limits";
import { exportCompanyCsv } from "@/server/loyalty/service";
import { rateLimit } from "@/server/security/rateLimit";
import { requireMembership } from "@/server/tenancy";

export const dynamic = "force-dynamic";

function err(status: number, error: string, message: string) {
  return Response.json({ error, message }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return err(401, "UNAUTHORIZED", "Войдите в аккаунт.");
    const rl = await rateLimit(`export:${user.id}`, 10, 60);
    if (!rl.ok) return err(429, "RATE_LIMITED", "Слишком часто. Повторите позже.");
    const companyId = z.string().min(1).max(64).safeParse(new URL(req.url).searchParams.get("companyId"));
    if (!companyId.success) return err(400, "VALIDATION", "Не указана компания.");
    const { company } = await requireMembership(companyId.data, ["OWNER", "MANAGER"]);
    const plan = (await effectivePlan(company)) as PlanId;
    if (!PLAN_LIMITS[plan].export) return err(402, "PLAN_LIMIT", "Экспорт доступен на тарифе TOP.");
    const csv = await exportCompanyCsv(company.id);
    return new Response("﻿" + csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="qronus-${new Date().toISOString().slice(0, 10)}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    if (e instanceof AppError) return err(e.status, e.code, e.message);
    console.error("[api/app/export]", e);
    return err(500, "INTERNAL", "Не удалось сформировать файл.");
  }
}
