import { NextResponse } from "next/server";
import { runDueJobs } from "@/server/jobs";
import { publicDeploymentRevision } from "@/lib/deployment-revision";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  // Fire-and-forget: housekeeping must never slow down or fail the health check.
  void runDueJobs().catch(() => {});
  // No secrets, backend metadata or environment-variable values are disclosed.
  // The public revision lets maintainers verify which Render Git commit is live.
  return NextResponse.json(
    {
      ok: true,
      time: new Date().toISOString(),
      revision: publicDeploymentRevision(process.env.RENDER_GIT_COMMIT ?? process.env.QRONUS_GIT_COMMIT),
    },
    { headers: { "Cache-Control": "no-store, max-age=0", "X-Robots-Tag": "noindex, nofollow" } },
  );
}
