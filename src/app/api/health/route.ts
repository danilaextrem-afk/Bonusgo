import { NextResponse } from "next/server";
import { runDueJobs } from "@/server/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  // Fire-and-forget: housekeeping must never slow down or fail the health check.
  void runDueJobs().catch(() => {});
  return NextResponse.json({ ok: true, time: new Date().toISOString() });
}
