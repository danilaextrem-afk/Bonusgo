import { headers } from "next/headers";
import { ydb } from "@/server/ydb/client";
import { nowSec } from "@/server/ydb/values";

/**
 * Fixed-window rate limiter: one serializable transaction reads the rate_limits row, computes the
 * new window/count and UPSERTs it (concurrent hits conflict and are retried, so none are lost).
 * Returns ok=false once more than `limit` hits happened in the current window.
 */
export async function rateLimit(key: string, limit: number, windowSec: number): Promise<{ ok: boolean; retryAfter: number }> {
  const sql = await ydb();
  const { count, retry } = await sql.begin(async (tx) => {
    const now = nowSec();
    const [[row]] = await tx<[{ window_start: Date | null; count: number | null }]>`SELECT window_start, \`count\` FROM rate_limits WHERE \`key\` = ${key}`;
    const fresh = !row?.window_start || new Date(row.window_start).getTime() <= now.getTime() - windowSec * 1000;
    const start = fresh ? now : new Date(row!.window_start!);
    const n = fresh ? 1 : Number(row!.count ?? 0) + 1;
    await tx`UPSERT INTO rate_limits (\`key\`, window_start, \`count\`) VALUES (${key}, ${start}, ${n})`;
    return { count: n, retry: Math.max(0, (start.getTime() + windowSec * 1000 - now.getTime()) / 1000) };
  });
  if (count <= limit) return { ok: true, retryAfter: 0 };
  return { ok: false, retryAfter: Math.max(1, Math.ceil(retry)) };
}

/** Best-effort client IP from proxy headers (first X-Forwarded-For hop, then X-Real-IP). */
export async function getClientIp(): Promise<string> {
  try {
    const h = await headers();
    const xff = h.get("x-forwarded-for");
    // The leftmost entries are client-controlled and can be spoofed; the hosting proxy
    // appends the real client IP on the right. TRUSTED_PROXY_HOPS = proxies in front of the app.
    const parts = xff?.split(",").map((p) => p.trim()).filter(Boolean) ?? [];
    const hops = Math.max(1, Number(process.env.TRUSTED_PROXY_HOPS ?? 1) || 1);
    const ip = parts[Math.max(0, parts.length - hops)];
    if (ip) return ip.slice(0, 64);
    const real = h.get("x-real-ip")?.trim();
    if (real) return real.slice(0, 64);
  } catch {
    /* outside request scope */
  }
  return "unknown";
}
