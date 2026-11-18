"use server";
import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/app/action-types";
import { guard, str } from "@/components/app/action-utils";
import { requirePlatformAdmin } from "@/server/auth/session";
import { confirmSbpPayment, issueSbpReceipt, rejectSbpPayment } from "@/server/payments/sbp";

export async function confirmSbpAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const r = await guard(async () => {
    const admin = await requirePlatformAdmin();
    return confirmSbpPayment(str(fd, "paymentId"), admin.id);
  });
  revalidatePath("/admin");
  if (!r.ok) return { error: r.error };
  if (!r.data.changed) return { ok: "Платёж уже обработан." };
  if (r.data.receipt?.ok) return { ok: "Подтверждено. Тариф продлён, чек отправлен в «Мой налог»." };
  return { ok: `Подтверждено, тариф продлён. Чек не отправлен: ${r.data.receipt?.error === "not_configured" ? "автоматика не настроена — выбейте чек вручную" : r.data.receipt?.error}` };
}

export async function rejectSbpAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const r = await guard(async () => {
    const admin = await requirePlatformAdmin();
    return rejectSbpPayment(str(fd, "paymentId"), admin.id);
  });
  revalidatePath("/admin");
  if (!r.ok) return { error: r.error };
  return { ok: r.data.changed ? "Отклонено, прежний тариф восстановлен." : "Платёж уже обработан." };
}

export async function retryReceiptAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const r = await guard(async () => {
    await requirePlatformAdmin();
    return issueSbpReceipt(str(fd, "paymentId"));
  });
  revalidatePath("/admin");
  if (!r.ok) return { error: r.error };
  return r.data.ok ? { ok: "Чек отправлен." } : { error: r.data.error ?? "Не удалось отправить чек" };
}
