import Link from "next/link";
import { PageHeader, formatDate } from "@/components/app/ui";
import { requireUser } from "@/server/auth/session";
import { AppError } from "@/server/errors";
import { listCustomerHistory } from "@/server/loyalty/customer-history";

export const dynamic = "force-dynamic";
const TYPES: Record<string, string> = {
  ACCRUE: "Начисление",
  REDEEM: "Списание награды",
  ADJUST: "Корректировка",
  REFERRAL_BONUS: "Бонус за приглашение",
};

export default async function CustomerHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>;
}) {
  const user = await requireUser();
  const { cursor } = await searchParams;
  let result: Awaited<ReturnType<typeof listCustomerHistory>> | null = null;
  let error: string | null = null;
  try {
    result = await listCustomerHistory(user.id, cursor);
  } catch (e) {
    if (e instanceof AppError && e.code === "VALIDATION") error = e.message;
    else throw e;
  }

  return (
    <>
      <PageHeader title="Все бонусные операции" subtitle="История начислений и списаний по вашим картам" />
      <div className="card space-y-3">
        <Link href="/me" className="text-sm text-neon underline">
          Вернуться к бонусным картам
        </Link>
        {error && (
          <p role="alert" className="text-sm text-warn">
            {error} <Link href="/me/history" className="underline">Начать с первой страницы</Link>
          </p>
        )}
        {result && result.items.length === 0 && (
          <p className="text-sm text-muted">Операций на этой странице нет.</p>
        )}
        {result && result.items.length > 0 && (
          <ul className="divide-y divide-line text-sm">
            {result.items.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-4 py-3">
                <span className="min-w-0">
                  <strong className="block">{TYPES[item.type] ?? item.type}</strong>
                  <span className="block text-xs text-muted">
                    {item.companyName} · {item.programName} · {formatDate(item.createdAt)}
                  </span>
                </span>
                <strong className={item.amount < 0 ? "text-warn" : "text-neon"}>
                  {item.amount > 0 ? `+${item.amount}` : item.amount}
                </strong>
              </li>
            ))}
          </ul>
        )}
        {result?.nextCursor && (
          <div className="pt-2">
            <Link
              href={`/me/history?cursor=${encodeURIComponent(result.nextCursor)}`}
              className="btn-secondary"
            >
              Показать более ранние операции
            </Link>
          </div>
        )}
      </div>
    </>
  );
}
