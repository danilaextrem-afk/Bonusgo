import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/server/db";
import { AppError } from "@/server/errors";
import { getCurrentUser, assertSameOrigin } from "@/server/auth/session";
import { requireMembership } from "@/server/tenancy";
import { rateLimit } from "@/server/security/rateLimit";
import { accrue, redeem } from "@/server/loyalty/service";

export const dynamic = "force-dynamic";

const body = z.object({
  companyId: z.string().min(1).max(64),
  action: z.enum(["accrue", "redeem"]),
  programId: z.string().min(1).max(64),
  customerToken: z.string().trim().min(8).max(400),
  purchaseMinor: z.number().int().min(1).max(100_000_000_00).optional(),
  stamps: z.number().int().min(1).max(20).optional(),
  rewardId: z.string().min(1).max(64).optional(),
  idempotencyKey: z.string().min(8).max(100),
});

function json(data: unknown, status = 200, headers?: Record<string, string>) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const user = await getCurrentUser();
    if (!user) return json({ error: "UNAUTHORIZED", message: "Войдите в аккаунт, чтобы продолжить." }, 401);

    const rl = await rateLimit(`ops:${user.id}`, 120, 60);
    if (!rl.ok) {
      return json({ error: "RATE_LIMITED", message: "Слишком часто. Подождите немного и повторите." }, 429, { "Retry-After": String(Math.ceil(rl.retryAfter)) });
    }

    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return json({ error: "BAD_REQUEST", message: "Некорректный запрос." }, 400);
    }
    const parsed = body.safeParse(raw);
    if (!parsed.success) {
      return json({ error: "VALIDATION", message: parsed.error.issues[0]?.message ?? "Проверьте введённые данные." }, 400);
    }
    const v = parsed.data;
    const { membership } = await requireMembership(v.companyId, ["OWNER", "MANAGER", "STAFF"]);

    // Program must belong to the verified company (and to the staff member's venue, if restricted).
    const prog = (
      await db
        .select({ id: schema.programs.id, venueId: schema.programs.venueId, type: schema.programs.type, stampsRequired: schema.programs.stampsRequired })
        .from(schema.programs)
        .where(and(eq(schema.programs.id, v.programId), eq(schema.programs.companyId, v.companyId)))
    )[0];
    if (!prog) return json({ error: "NOT_FOUND", message: "Программа не найдена." }, 404);
    if (membership.venueId && membership.venueId !== prog.venueId) {
      return json({ error: "FORBIDDEN", message: "Эта программа относится к другому заведению." }, 403);
    }

    const common = { actorUserId: user.id, companyId: v.companyId, programId: v.programId, customerToken: v.customerToken, idempotencyKey: v.idempotencyKey };
    if (v.action === "accrue") {
      if (prog.type === "POINTS" && !v.purchaseMinor) return json({ error: "VALIDATION", message: "Укажите сумму покупки." }, 400);
      const res = await accrue({ ...common, purchaseMinor: prog.type === "POINTS" ? v.purchaseMinor : undefined, stamps: prog.type === "STAMPS" ? (v.stamps ?? 1) : undefined });
      return json({ ok: true, action: "accrue", duplicated: !!res.duplicated, balance: res.card.balance, type: prog.type, stampsRequired: prog.stampsRequired });
    }
    const res = await redeem({ ...common, rewardId: v.rewardId });
    return json({ ok: true, action: "redeem", duplicated: !!res.duplicated, balance: res.card.balance, type: prog.type, stampsRequired: prog.stampsRequired });
  } catch (e) {
    if (e instanceof AppError) return json({ error: e.code, message: e.message }, e.status);
    console.error("[api/app/operations]", e);
    return json({ error: "INTERNAL", message: "Не удалось выполнить операцию. Повторите — повтор безопасен." }, 500);
  }
}
