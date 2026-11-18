import "server-only";
import { audit } from "@/server/audit";
import { ydb } from "@/server/ydb/client";
import { num } from "@/server/ydb/values";
import { submitSitemapToIndexNow } from "@/server/indexnow";
import { notifyOwner } from "@/server/notify";
import { expireSubscriptions } from "@/server/payments/service";
import { rateLimit } from "@/server/security/rateLimit";

/**
 * Background housekeeping without an external scheduler or secrets: triggered by the health check,
 * which the keep-alive workflow pings every 10 minutes. Each job runs at most once per interval
 * across all instances (atomic window claim in rate_limits).
 */
const JOBS: { name: string; everySec: number; run: () => Promise<unknown>; enabled?: () => boolean }[] = [
  { name: "expire-subscriptions", everySec: 3600, run: () => expireSubscriptions() },
  {
    name: "indexnow",
    everySec: 24 * 3600,
    enabled: () => process.env.NODE_ENV === "production" && Boolean(process.env.INDEXNOW_KEY) && (process.env.APP_URL ?? "").startsWith("https://") && !process.env.REDIRECT_TO,
    run: () => submitSitemapToIndexNow(),
  },
  {
    name: "sbp-reminder",
    everySec: 6 * 3600,
    enabled: () => Boolean(process.env.TELEGRAM_BOT_TOKEN),
    run: async () => {
      const olderThan = new Date(Date.now() - 12 * 3600_000);
      const sql = await ydb();
      const [[row]] = await sql<[{ n: bigint }]>`
        SELECT COUNT(*) AS n FROM payments
        WHERE provider = ${"sbp"} AND status = ${"PENDING"} AND claimed_at IS NOT NULL AND claimed_at < ${olderThan}`;
      const n = num(row?.n);
      if (n > 0) await notifyOwner(`⏰ ${n} оплат(ы) по СБП ждут подтверждения больше 12 часов: ${process.env.APP_URL ?? ""}/admin`);
      return { pending: n };
    },
  },
];

let running = false;

export async function runDueJobs(): Promise<string[]> {
  if (running) return [];
  running = true;
  const ran: string[] = [];
  try {
    for (const job of JOBS) {
      if (job.enabled && !job.enabled()) continue;
      const claim = await rateLimit(`job:${job.name}`, 1, job.everySec);
      if (!claim.ok) continue;
      try {
        const result = await job.run();
        ran.push(job.name);
        await audit(`job.${job.name}`, { meta: { result: JSON.parse(JSON.stringify(result ?? null)) } });
      } catch (e) {
        await audit(`error.job_${job.name}`, { meta: { message: (e instanceof Error ? e.message : String(e)).slice(0, 300) } });
      }
    }
  } finally {
    running = false;
  }
  return ran;
}
