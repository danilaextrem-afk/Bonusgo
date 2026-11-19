import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { PlanGate } from "@/components/app/PlanGate";
import { Empty, PageHeader, formatDate } from "@/components/app/ui";
import { pNum, pStr, pick } from "@/components/app/adapt";
import { requireCompanyContext, sp1 } from "@/components/app/data";
import { db, schema } from "@/server/db";
import { listTransactions } from "@/server/loyalty/service";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

const TYPE: Record<string, string> = { ACCRUE: "Начисление", REDEEM: "Списание награды", ADJUST: "Корректировка", REFERRAL_BONUS: "Бонус за приглашение" };

export default async function CardHistoryPage({
  params, searchParams,
}: {
  params: Promise<{ cardId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { cardId } = await params;
  const sp = await searchParams;
  const requested = Number(sp1(sp.page) ?? "1");
  const page = Number.isSafeInteger(requested) ? Math.min(1000, Math.max(1, requested)) : 1;
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
      .innerJoin(schema.programs, and(
        eq(schema.programs.id, schema.cards.programId),
        eq(schema.programs.companyId, schema.cards.companyId),
      ))
      .where(and(eq(schema.cards.id, cardId), eq(schema.cards.companyId, company.id)))
  )[0];
  if (!card) notFound();
  const { items: txs, total } = await listTransactions(company.id, {
    cardId: card.id, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE,
  });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageLink = (n: number) => `/app/customers/${encodeURIComponent(cardId)}?page=${n}`;
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
      {total > 0 && (
        <nav className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm" aria-label="Страницы истории операций">
          <p className="text-muted">Всего операций: {total}. Страница {page} из {totalPages}.</p>
          <div className="flex gap-2">
            {page > 1 && <Link href={pageLink(page - 1)} className="btn-secondary">← Новее</Link>}
            {page < totalPages && <Link href={pageLink(page + 1)} className="btn-secondary">Ранее →</Link>}
            {page > totalPages && <Link href={pageLink(totalPages)} className="btn-secondary">Последняя страница</Link>}
          </div>
        </nav>
      )}
    </>
  );
}
