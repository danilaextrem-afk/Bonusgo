import { timingSafeEqual } from "node:crypto";
import { expireSubscriptions } from "@/server/payments/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  const got = req.headers.get("x-cron-secret") ?? "";
  const a = Buffer.from(secret);
  const b = Buffer.from(got);
  if (!secret || a.length !== b.length || !timingSafeEqual(a, b)) return Response.json({ error: "forbidden" }, { status: 403 });
  return Response.json({ ok: true, ...(await expireSubscriptions()) });
}
