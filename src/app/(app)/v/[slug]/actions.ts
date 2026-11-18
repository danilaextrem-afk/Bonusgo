"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionState } from "@/components/app/action-types";
import { UiError, guard, parseForm } from "@/components/app/action-utils";
import { getCurrentUser } from "@/server/auth/session";
import { joinProgram } from "@/server/loyalty/service";
import { getClientIp, rateLimit } from "@/server/security/rateLimit";

const schema = z.object({ programId: z.string().min(1).max(64), slug: z.string().min(1).max(100) });

export async function joinAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const r = await guard(async () => {
    const v = parseForm(schema, fd);
    const user = await getCurrentUser();
    if (!user) redirect(`/register?role=customer&next=${encodeURIComponent(`/v/${v.slug}`)}`);
    const rl = await rateLimit(`join:${user.id}:${await getClientIp()}`, 20, 600);
    if (!rl.ok) throw new UiError("Слишком много попыток. Повторите чуть позже.");
    await joinProgram(user.id, v.programId);
  });
  if (!r.ok) return { error: r.error };
  redirect("/me");
}
