import { PROVIDERS } from "@/server/payments/registry";
import { processNotification } from "@/server/payments/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const text = (s: string, status = 200) => new Response(s, { status, headers: { "content-type": "text/plain; charset=utf-8" } });

export async function POST(req: Request) {
  const form: Record<string, string> = {};
  for (const [k, v] of (await req.formData()).entries()) if (typeof v === "string") form[k] = v;
  const parsed = PROVIDERS.robokassa.verifyNotification({ form });
  const r = await processNotification("robokassa", parsed);
  if (!r.ok) return text(r.reason, 400);
  return text(`OK${parsed.invoiceNo}`);
}
