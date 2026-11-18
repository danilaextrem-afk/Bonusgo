import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import sitemap from "@/app/sitemap";
import { SITE_URL } from "@/lib/seo";

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

  const urlList = sitemap().map((e) => e.url).slice(0, 10000);
  const host = new URL(SITE_URL).host;
  try {
    const res = await fetch("https://yandex.com/indexnow", {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ host, key, keyLocation: `${SITE_URL}/${key}.txt`, urlList }),
    });
    return NextResponse.json({ ok: res.ok, status: res.status, submitted: urlList.length }, { status: res.ok ? 200 : 502 });
  } catch {
    return NextResponse.json({ ok: false, error: "upstream_failed" }, { status: 502 });
  }
}
