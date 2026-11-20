import { z } from "zod";
import { assertSameOrigin, verifyCsrf } from "@/server/auth/session";
import { AppError, ForbiddenError } from "@/server/errors";
import { refreshPlategaPayment } from "@/server/payments/service";
import { requireMembership } from "@/server/tenancy";
import { billing } from "../../_util";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const id = z.string().regex(/^[A-Za-z0-9_-]{22}$/);
const fields = z.object({ companyId: id, paymentId: id });

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const form = await req.formData();
    const csrf = form.get("csrf");
    if (typeof csrf !== "string" || !(await verifyCsrf(csrf))) throw new ForbiddenError();
    const parsed = fields.safeParse({ companyId: form.get("companyId"), paymentId: form.get("paymentId") });
    if (!parsed.success) return billing("refresh-unavailable");
    const { companyId, paymentId } = parsed.data;
    await requireMembership(companyId, ["OWNER"]);
    return billing(await refreshPlategaPayment(companyId, paymentId));
  } catch (error) {
    if (error instanceof AppError) return Response.json({ error: error.code, message: error.message }, { status: error.status });
    return billing("refresh-unavailable");
  }
}
