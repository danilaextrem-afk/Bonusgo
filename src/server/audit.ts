import { createId } from "@/server/id";
import { ydb } from "@/server/ydb/client";
import { nowSec, optJson, optText } from "@/server/ydb/values";

/** Append-only audit log. Never throws (logging must not break business flows). */
export async function audit(
  action: string,
  o: { actorUserId?: string | null; companyId?: string | null; meta?: Record<string, unknown> | null; ip?: string | null } = {},
): Promise<void> {
  try {
    const sql = await ydb();
    await sql`UPSERT INTO audit_logs (id, actor_user_id, company_id, action, meta, ip, created_at)
              VALUES (${createId()}, ${optText(o.actorUserId)}, ${optText(o.companyId)}, ${action.slice(0, 100)}, ${optJson(o.meta)}, ${optText(o.ip)}, ${nowSec()})`;
  } catch (e) {
    console.error("[audit] failed", action, e instanceof Error ? e.message : e);
  }
}
