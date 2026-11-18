import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/server/errors";
import { assertSameOrigin } from "@/server/auth/session";
import { createPaymentOrder } from "@/server/payments/service";
import { requireMembership } from "@/server/tenancy";
import { billing, redirectTo } from "../_util";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ companyId: z.string().min(1).max(64), plan: z.enum(["PRO", "TOP"]), months: z.coerce.number().pipe(z.union([z.literal(1), z.literal(3), z.literal(12)])) });

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const f = schema.safeParse(Object.fromEntries((await req.formData()).entries()));
    if (!f.success) return billing("error");
    await requireMembership(f.data.companyId, ["OWNER"]);
    const o = await createPaymentOrder(f.data.companyId, f.data.plan, f.data.months);
    return NextResponse.redirect(o.redirectUrl, 303);
  } catch (e) {
    if (e instanceof AppError) return NextResponse.json({ error: e.code, message: e.message }, { status: e.status });
    return redirectTo("/app/billing?status=unavailable");
  }
}
