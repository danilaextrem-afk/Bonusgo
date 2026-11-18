import { PROVIDERS } from "@/server/payments/registry";
import { processNotification } from "@/server/payments/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = PROVIDERS.bepaid.verifyNotification({ headers: { authorization: req.headers.get("authorization") ?? undefined }, json });
  if (!parsed.ok) return Response.json({ error: "unauthorized" }, { status: 401 });
  const r = await processNotification("bepaid", parsed);
  return Response.json({ ok: r.ok }, { status: r.ok ? 200 : 400 });
}
