import { db, schema } from "@/server/db";

/** Append-only audit log. Never throws (logging must not break business flows). */
export async function audit(
  action: string,
  o: { actorUserId?: string | null; companyId?: string | null; meta?: Record<string, unknown> | null; ip?: string | null } = {},
): Promise<void> {
  try {
    await db.insert(schema.auditLogs).values({
      action: action.slice(0, 100),
      actorUserId: o.actorUserId ?? null,
      companyId: o.companyId ?? null,
      meta: o.meta ?? null,
      ip: o.ip ?? null,
    });
  } catch (e) {
    console.error("[audit] failed", action, e instanceof Error ? e.message : e);
  }
}
