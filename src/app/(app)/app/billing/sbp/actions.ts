"use server";
import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/app/action-types";
import { guard, str } from "@/components/app/action-utils";
import { actionCtx } from "@/components/app/data";
import { claimSbpPayment } from "@/server/payments/sbp";

export async function claimSbpAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const r = await guard(async () => {
    const companyId = str(fd, "companyId");
    await actionCtx(companyId, ["OWNER"]);
    return claimSbpPayment(companyId, str(fd, "paymentId"), { inn: str(fd, "payerInn"), name: str(fd, "payerName") });
  });
  if (!r.ok) return { error: r.error };
  revalidatePath("/app/billing");
  revalidatePath(`/app/billing/sbp/${str(fd, "paymentId")}`);
  return {
    ok: r.data.grace
      ? "Спасибо! Тариф уже включён. Мы сверим перевод в течение дня и продлим его на весь оплаченный срок."
      : "Спасибо! Мы сверим перевод в течение дня и включим тариф.",
  };
}
