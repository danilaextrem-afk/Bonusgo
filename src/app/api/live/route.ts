import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Process liveness must not depend on PostgreSQL, payment providers,
 * Telegram or housekeeping jobs. Render calls this endpoint regularly.
 */
export function GET() {
  return NextResponse.json(
    { ok: true },
    { headers: {
      "Cache-Control": "no-store, max-age=0",
      "X-Robots-Tag": "noindex, nofollow",
    } },
  );
}
