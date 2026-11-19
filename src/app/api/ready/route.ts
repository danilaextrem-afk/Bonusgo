import { NextResponse } from "next/server";
import { db } from "@/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "X-Robots-Tag": "noindex, nofollow",
};

/**
 * Database readiness is separate from process liveness.
 * Never echo database errors, credentials or network diagnostics publicly.
 * This endpoint is read-only: no migrations or scheduled jobs.
 */
export async function GET() {
  try {
    const probe = { text: "SELECT 1", query_timeout: 2_000 };
    await db.$client.query(probe);
    return NextResponse.json({ ok: true }, { headers: HEADERS });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503, headers: HEADERS });
  }
}
