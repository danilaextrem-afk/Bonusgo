import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { submitSitemapToIndexNow } from "@/server/indexnow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** POST /api/indexnow — submit all sitemap URLs to Yandex IndexNow. Protected by x-cron-secret. */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  const key = process.env.INDEXNOW_KEY;
  if (!secret || !key) return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });
  const given = req.headers.get("x-cron-secret") ?? "";
  if (!safeEqual(given, secret)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

  const r = await submitSitemapToIndexNow();
  return NextResponse.json(r, { status: r.ok ? 200 : 502 });
}
