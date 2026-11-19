import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError, ForbiddenError } from "@/server/errors";
import { assertSameOrigin, verifyCsrf } from "@/server/auth/session";
import { createPaymentOrder } from "@/server/payments/service";
import { requireMembership } from "@/server/tenancy";
import { billing, redirectTo } from "../_util";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ companyId: z.string().min(1).max(64), plan: z.enum(["PRO", "TOP"]), months: z.coerce.number().pipe(z.union([z.literal(1), z.literal(3), z.literal(12)])) });

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const form = Object.fromEntries((await req.formData()).entries());
    // A same-origin header is necessary but not sufficient: validate the existing
    // session-bound token before authorising a paid checkout or creating an order.
    const csrf = typeof form.csrf === "string" ? form.csrf : null;
    if (!(await verifyCsrf(csrf))) throw new ForbiddenError("Недействительный токен формы. Обновите страницу и повторите попытку.");
    const f = schema.safeParse(form);
    if (!f.success) return billing("error");
    const { user } = await requireMembership(f.data.companyId, ["OWNER"]);
    const o = await createPaymentOrder(f.data.companyId, f.data.plan, f.data.months, { id: user.id, email: user.email });
    return NextResponse.redirect(o.redirectUrl, 303);
  } catch (e) {
    if (e instanceof AppError) return NextResponse.json({ error: e.code, message: e.message }, { status: e.status });
    return redirectTo("/app/billing?status=unavailable");
  }
}
