import { NextResponse } from "next/server";
import { audit } from "@/server/audit";
import { plategaCallbackAuthorized, verifyPlategaTransaction } from "@/server/payments/platega";
import { processNotification } from "@/server/payments/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Platega status callback. 401 on bad credentials, 500 makes Platega retry (3× every 5 min). */
export async function POST(req: Request) {
  if (!plategaCallbackAuthorized(req.headers)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  let body: { id?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad_body" }, { status: 400 });
  }
  if (!body || typeof body.id !== "string") return NextResponse.json({ ok: false, error: "bad_body" }, { status: 400 });
  try {
    const verified = await verifyPlategaTransaction(body.id);
    if (!verified) return NextResponse.json({ ok: true, ignored: true });
    const r = await processNotification("platega", verified);
    return NextResponse.json({ ok: r.ok });
  } catch {
    await audit("error.platega_callback_failed", {});
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
