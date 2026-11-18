import { createHash } from "node:crypto";
import { z } from "zod";
import { getClientIp, rateLimit } from "@/server/security/rateLimit";
import { trackEvent } from "@/server/loyalty/analytics";

export const dynamic = "force-dynamic";

const body = z.object({
  type: z.enum(["page_view", "referral_click"]),
  path: z.string().min(1).max(200).startsWith("/"),
  source: z.enum(["organic", "referral", "direct", "qr"]).optional(),
});

/** Anonymous analytics beacon. No cookies; the IP is only hashed for rate limiting. */
export async function POST(req: Request) {
  try {
    const ip = await getClientIp();
    const key = createHash("sha256").update(`track:${ip}`).digest("hex").slice(0, 24);
    const rl = await rateLimit(`track:${key}`, 60, 60);
    if (!rl.ok) return new Response(null, { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfter)) } });

    const text = await req.text();
    if (text.length > 2000) return new Response(null, { status: 413 });
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      return new Response(null, { status: 400 });
    }
    const parsed = body.safeParse(raw);
    if (!parsed.success) return new Response(null, { status: 400 });
    const { type, path, source } = parsed.data;
    const country = /^\/ru(\/|$)/.test(path) ? "RU" : /^\/by(\/|$)/.test(path) ? "BY" : undefined;
    await trackEvent(type, { country, path, source });
    return new Response(null, { status: 204 });
  } catch (e) {
    console.error("[api/track]", e);
    return new Response(null, { status: 204 });
  }
}
