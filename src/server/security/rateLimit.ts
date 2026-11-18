import { headers } from "next/headers";
import { sql } from "drizzle-orm";
import { db } from "@/server/db";

/**
 * Fixed-window rate limiter backed by one atomic upsert on rate_limits.
 * Returns ok=false once more than `limit` hits happened in the current window.
 */
export async function rateLimit(key: string, limit: number, windowSec: number): Promise<{ ok: boolean; retryAfter: number }> {
  const res = await db.execute(sql`
    INSERT INTO rate_limits (key, window_start, count) VALUES (${key}, now(), 1)
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN rate_limits.window_start <= now() - make_interval(secs => ${windowSec}::double precision) THEN 1 ELSE rate_limits.count + 1 END,
      window_start = CASE WHEN rate_limits.window_start <= now() - make_interval(secs => ${windowSec}::double precision) THEN now() ELSE rate_limits.window_start END
    RETURNING count, GREATEST(0, EXTRACT(EPOCH FROM (window_start + make_interval(secs => ${windowSec}::double precision) - now())))::float8 AS retry`);
  const row = res.rows[0] as { count: number; retry: number } | undefined;
  const count = Number(row?.count ?? 1);
  if (count <= limit) return { ok: true, retryAfter: 0 };
  return { ok: false, retryAfter: Math.max(1, Math.ceil(Number(row?.retry ?? windowSec))) };
}

/** Best-effort client IP from proxy headers (first X-Forwarded-For hop, then X-Real-IP). */
export async function getClientIp(): Promise<string> {
  try {
    const h = await headers();
    const xff = h.get("x-forwarded-for");
    const first = xff?.split(",")[0]?.trim();
    if (first) return first.slice(0, 64);
    const real = h.get("x-real-ip")?.trim();
    if (real) return real.slice(0, 64);
  } catch {
    /* outside request scope */
  }
  return "unknown";
}
