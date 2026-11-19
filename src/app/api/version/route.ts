import { NextResponse } from "next/server";
import { publicDeploymentRevision } from "@/lib/deployment-revision";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Side-effect-free deployment inspection endpoint.
 * Unlike /api/health, this does not run housekeeping jobs or query the database.
 */
export function GET() {
  return NextResponse.json(
    { revision: publicDeploymentRevision(process.env.RENDER_GIT_COMMIT) },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "X-Robots-Tag": "noindex, nofollow",
      },
    },
  );
}
