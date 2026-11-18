import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { PlanGate } from "@/components/app/PlanGate";
import { Empty, PageHeader, formatDate } from "@/components/app/ui";
import { asArray, pNum, pStr, pick } from "@/components/app/adapt";
import { requireCompanyContext } from "@/components/app/data";
import { db, schema } from "@/server/db";
import { listTransactions } from "@/server/loyalty/service";

export const dynamic = "force-dynamic";

const TYPE: Record<string, string> = { ACCRUE: "Начисление", REDEEM: "Списание награды", ADJUST: "Корректировка", REFERRAL_BONUS: "Бонус за приглашение" };

export default async function CardHistoryPage({ params }: { params: Promise<{ cardId: string }> }) {
  const { cardId } = await params;
  const { company, limits } = await requireCompanyContext();
  if (!limits.history) {
    return (
      <>
        <PageHeader title="История клиента" />
        <PlanGate title="История операций">Видите, когда и сколько клиент накопил и потратил.</PlanGate>
      </>
    );
  }
  const card = (
    await db
      .select({ id: schema.cards.id, balance: schema.cards.balance, name: schema.users.name, email: schema.users.email, program: schema.programs.name })
      .from(schema.cards)
      .innerJoin(schema.users, eq(schema.users.id, schema.cards.customerId))
      .innerJoin(schema.programs, eq(schema.programs.id, schema.cards.programId))
      .where(and(eq(schema.cards.id, cardId), eq(schema.cards.companyId, company.id)))
  )[0];
  if (!card) notFound();
  const txs = asArray(await listTransactions(company.id, { cardId: card.id, limit: 100, offset: 0 }), "transactions");
  return (
    <>
      <PageHeader title={card.name || card.email} subtitle={`${card.program} · баланс ${card.balance}`} actions={<Link href="/app/customers" className="btn-ghost">← К списку</Link>} />
      {txs.length === 0 ? (
        <Empty>Операций пока нет.</Empty>
      ) : (
        <div className="card divide-y divide-line !p-0">
          {txs.map((t, i) => {
            const amount = pNum(t, "amount");
            const type = pStr(t, "type");
            return (
              <div key={pStr(t, "id") || i} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <div>
                  <div className="font-medium">{TYPE[type] ?? type}</div>
                  <div className="text-xs text-muted">{formatDate(pick(t, "createdAt") as string | Date | undefined)}</div>
                </div>
                <div className={`text-lg font-bold ${amount < 0 ? "text-warn" : "text-neon"}`}>{amount > 0 ? `+${amount}` : amount}</div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
