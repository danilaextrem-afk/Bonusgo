import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** GET /api/indexnow/key?key=... — serves INDEXNOW_KEY as text/plain; wire via rewrite /:key.txt -> /api/indexnow/key?key=:key */
export function GET(req: Request) {
  const key = process.env.INDEXNOW_KEY;
  const asked = new URL(req.url).searchParams.get("key");
  if (!key || !asked || asked !== key) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(key, { headers: { "content-type": "text/plain; charset=utf-8" } });
}
