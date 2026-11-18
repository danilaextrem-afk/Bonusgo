import { ActionForm } from "@/components/app/ActionForm";
import { SubmitButton } from "@/components/app/SubmitButton";
import { formatDate } from "@/components/app/ui";
import { formatMoney } from "@/lib/plans";
import { receiptUrl } from "@/server/payments/npd";
import { paymentCode, type listSbpClaims } from "@/server/payments/sbp";
import { confirmSbpAction, rejectSbpAction, retryReceiptAction } from "@/app/(app)/admin/actions";

type Claim = Awaited<ReturnType<typeof listSbpClaims>>[number];

export function SbpClaims({ claims }: { claims: Claim[] }) {
  if (claims.length === 0) return <p className="card text-sm text-muted">Заявок на оплату по СБП пока нет.</p>;
  const pending = claims.filter((c) => c.payment.status === "PENDING");
  // Processed claims that still need a manual receipt stay visible; the rest collapse.
  const needsReceipt = claims.filter((c) => c.payment.status === "PAID" && !c.payment.npdReceiptId);
  const rest = claims.filter((c) => c.payment.status !== "PENDING" && !(c.payment.status === "PAID" && !c.payment.npdReceiptId));
  return (
    <div className="space-y-3">
      {pending.length === 0 && <p className="card text-sm text-muted">Новых заявок нет.</p>}
      <ClaimList claims={pending} />
      {needsReceipt.length > 0 && (
        <details className="card">
          <summary className="cursor-pointer text-sm font-semibold text-warn">Без чека: {needsReceipt.length}</summary>
          <div className="mt-3"><ClaimList claims={needsReceipt} /></div>
        </details>
      )}
      {rest.length > 0 && (
        <details className="card">
          <summary className="cursor-pointer text-sm text-muted">Обработанные: {rest.length}</summary>
          <div className="mt-3"><ClaimList claims={rest} /></div>
        </details>
      )}
    </div>
  );
}

function ClaimList({ claims }: { claims: Claim[] }) {
  return (
    <div className="space-y-3">
      {claims.map(({ payment: p, companyName }) => (
        <div key={p.id} className={`card space-y-2 ${p.status === "PENDING" ? "border-warn/60" : ""}`}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="font-semibold">{companyName} · {p.plan} · {p.months} мес</div>
            <div className="font-mono text-lg">{formatMoney(p.amountMinor, p.currency)}</div>
          </div>
          <div className="text-sm text-muted">
            Код <span className="font-mono text-text">{paymentCode(p.invoiceNo)}</span> · отмечено {formatDate(p.claimedAt)}
            {p.payerInn ? ` · ИНН ${p.payerInn}` : " · физлицо"}
            {p.graceApplied && p.status === "PENDING" ? " · тариф временно включён" : ""}
          </div>
          {p.status === "PENDING" ? (
            <div className="grid grid-cols-2 gap-2">
              <ActionForm action={confirmSbpAction}>
                <input type="hidden" name="paymentId" value={p.id} />
                <SubmitButton className="btn-primary w-full">Подтвердить</SubmitButton>
              </ActionForm>
              <ActionForm action={rejectSbpAction} confirm="Перевод не пришёл? Тариф будет отключён.">
                <input type="hidden" name="paymentId" value={p.id} />
                <SubmitButton className="btn-ghost w-full">Отклонить</SubmitButton>
              </ActionForm>
            </div>
          ) : (
            <div className="text-sm">
              {p.status === "PAID" ? "✓ Подтверждено" : "✗ Отклонено"}
              {p.status === "PAID" && p.npdReceiptId && (
                <> · <a className="text-neon underline" href={receiptUrl(p.npdReceiptId)} target="_blank" rel="noreferrer">чек</a></>
              )}
              {p.status === "PAID" && !p.npdReceiptId && (
                <div className="mt-2 space-y-2">
                  <p className="text-warn">Чек не отправлен{p.npdError ? `: ${p.npdError}` : ""}</p>
                  <ActionForm action={retryReceiptAction}>
                    <input type="hidden" name="paymentId" value={p.id} />
                    <SubmitButton className="btn-ghost">Отправить чек ещё раз</SubmitButton>
                  </ActionForm>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
