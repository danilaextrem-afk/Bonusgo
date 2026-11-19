import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePlatformAdmin } from "@/server/auth/session";
import { runAdminLedgerAudit } from "@/server/loyalty/admin-ledger";
import { AppError } from "@/server/errors";
import type { CompanyLedgerAudit } from "@/server/loyalty/ledger-audit";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Сверка бонусных балансов — QRonus",
  robots: { index: false, follow: false },
};

export default async function LedgerAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ companyId?: string }>;
}) {
  const admin = await requirePlatformAdmin();
  // This sensitive view requires the actual database admin role, never
  // the ADMIN_EMAILS developer/testing fallback.
  if (admin.platformRole !== "ADMIN") notFound();

  const { companyId } = await searchParams;
  const requested = typeof companyId === "string" ? companyId.trim() : "";
  let report: CompanyLedgerAudit | null = null;
  let error: string | null = null;
  if (requested) {
    try {
      report = await runAdminLedgerAudit(requested);
    } catch (e) {
      error = e instanceof AppError ? e.message : "Не удалось выполнить сверку. Повторите позже.";
    }
  }

  return (
    <main className="container-x py-6">
      <a href="/admin" className="text-sm text-muted underline">Вернуться в админ-панель</a>
      <h1 className="mt-4 text-2xl font-bold">Сверка бонусных балансов</h1>
      <p className="my-3 text-sm text-muted">
        Только для администратора платформы. Проверка читает базу данных и не меняет балансы.
        Не используйте результат как подтверждение денежных платежей.
      </p>

      <form method="get" action="/admin/ledger" className="card mb-5 space-y-3">
        <label htmlFor="ledgerCompanyId" className="block text-sm font-medium">Идентификатор компании</label>
        <input
          id="ledgerCompanyId"
          name="companyId"
          type="text"
          required
          pattern="[A-Za-z0-9_-]{22}"
          maxLength={22}
          defaultValue={requested}
          autoComplete="off"
          className="w-full rounded-lg border border-line bg-transparent p-3 font-mono text-sm"
          placeholder="22 символа"
        />
        <button type="submit" className="rounded-lg bg-primary px-4 py-2 font-semibold text-white">
          Проверить баланс
        </button>
        <p className="text-xs text-muted">Не более пяти запросов за минуту на администратора.</p>
      </form>

      {error && <p role="alert" className="mb-5 text-sm text-danger">{error}</p>}
      {report && (
        <section className="card space-y-3">
          <h2 className="text-lg font-semibold">Результат сверки</h2>
          <p className="break-all text-sm text-muted">Компания: {report.companyId}</p>
          <p className="text-sm">
            Проверено карт: <strong>{report.cardsChecked}</strong>.
            {" "}Расхождений: <strong>{report.discrepancies.length}</strong>.
          </p>
          {report.discrepancies.length === 0 ? (
            <p className="text-sm">По проверенным картам расхождений не обнаружено.</p>
          ) : (
            <>
              <p role="alert" className="text-sm text-danger">
                Обнаружены расхождения. Не меняйте баланс автоматически; проверьте журнал операций.
              </p>
              <div className="max-w-full overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr>
                      <th className="p-2">Карта</th>
                      <th className="p-2">В базе</th>
                      <th className="p-2">По операциям</th>
                      <th className="p-2">Чужие транзакции</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.discrepancies.slice(0, 50).map((item) => (
                      <tr key={item.cardId} className="border-t border-line">
                        <td className="break-all p-2 font-mono">{item.cardId}</td>
                        <td className="p-2">{item.storedBalance}</td>
                        <td className="p-2">{item.ledgerBalance}</td>
                        <td className="p-2">{item.foreignTenantTransactions}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {report.discrepancies.length > 50 && (
                <p className="text-xs text-muted">Показаны первые 50 расхождений.</p>
              )}
            </>
          )}
        </section>
      )}
    </main>
  );
}
