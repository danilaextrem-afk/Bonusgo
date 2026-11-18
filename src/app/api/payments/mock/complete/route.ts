import { eq } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { mock, mockAllowed } from "@/server/payments/mock";
import { processNotification } from "@/server/payments/service";
import { billing } from "../../_util";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!mockAllowed()) return new Response("Not found", { status: 404 });
  const q = Object.fromEntries(new URL(req.url).searchParams.entries());
  const invoice = Number(q.invoice);
  if (!Number.isInteger(invoice)) return billing("fail");
  const [p] = await db.select().from(schema.payments).where(eq(schema.payments.invoiceNo, invoice)).limit(1);
  if (!p || p.provider !== "mock") return billing("fail");
  const parsed = mock.verifyNotification({ query: q, expectedAmountMinor: p.amountMinor });
  const r = await processNotification("mock", parsed);
  return billing(r.ok ? "success" : "fail");
}
