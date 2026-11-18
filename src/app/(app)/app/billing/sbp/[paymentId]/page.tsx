import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/app/ActionForm";
import { CopyButton } from "@/components/app/CopyButton";
import { SubmitButton } from "@/components/app/SubmitButton";
import { Notice, PageHeader } from "@/components/app/ui";
import { requireCompanyContext } from "@/components/app/data";
import { formatMoney } from "@/lib/plans";
import { GRACE_DAYS, getSbpPayment } from "@/server/payments/sbp";
import { formatMajor } from "@/server/payments/types";
import { claimSbpAction } from "../actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Оплата по СБП", robots: { index: false, follow: false } };

function prettyPhone(p: string) {
  const d = p.replace(/\D/g, "");
  return d.length === 11 ? `+7 ${d.slice(1, 4)} ${d.slice(4, 7)}-${d.slice(7, 9)}-${d.slice(9)}` : p;
}

export default async function SbpPaymentPage({ params }: { params: Promise<{ paymentId: string }> }) {
  const { paymentId } = await params;
  const { company } = await requireCompanyContext(["OWNER"]);
  const data = await getSbpPayment(company.id, paymentId).catch(() => null);
  if (!data) notFound();
  const { payment: p, details, code } = data;
  const amount = formatMoney(p.amountMinor, p.currency);

  return (
    <>
      <PageHeader title="Оплата по СБП" subtitle={`Тариф ${p.plan} · ${p.months} мес · ${amount}`} />
      <div className="max-w-xl space-y-4">
        {p.status === "PAID" && <Notice tone="ok">Оплата подтверждена, тариф {p.plan} активен.</Notice>}
        {p.status === "FAILED" && <Notice tone="danger">Перевод не найден. Если вы переводили деньги, напишите нам — укажите код {code}.</Notice>}
        {p.status === "PENDING" && p.claimedAt && (
          <Notice tone="ok">Вы отметили перевод. {p.graceApplied ? `Тариф уже включён на ${GRACE_DAYS} дня, ` : ""}после сверки продлим его на весь срок.</Notice>
        )}

        {p.status === "PENDING" && !p.claimedAt && (
          <>
            <div className="card space-y-4">
              <h2 className="font-semibold">1. Переведите по номеру телефона</h2>
              <Row label="Телефон" value={prettyPhone(details.phone)} copy={details.phone} />
              <Row label="Банк получателя" value={details.bank || "—"} />
              {details.recipient && <Row label="Получатель" value={details.recipient} />}
              <Row label="Сумма" value={amount} copy={formatMajor(p.amountMinor)} />
              <Row label="Комментарий к переводу" value={code} copy={code} />
              <p className="text-xs text-muted">В приложении банка: Платежи → По номеру телефона → выберите банк получателя. Комментарий помогает быстрее найти ваш перевод.</p>
            </div>

            <div className="card">
              <h2 className="mb-3 font-semibold">2. Отметьте оплату</h2>
              <ActionForm action={claimSbpAction} className="space-y-3">
                <input type="hidden" name="companyId" value={company.id} />
                <input type="hidden" name="paymentId" value={p.id} />
                <div>
                  <label className="label" htmlFor="payerInn">ИНН плательщика (если платите от компании или ИП)</label>
                  <input id="payerInn" name="payerInn" inputMode="numeric" maxLength={12} defaultValue={company.taxId ?? ""} className="input" placeholder="Необязательно" />
                </div>
                <div>
                  <label className="label" htmlFor="payerName">Название организации для чека</label>
                  <input id="payerName" name="payerName" maxLength={120} defaultValue={company.legalName ?? ""} className="input" placeholder="Необязательно" />
                </div>
                <SubmitButton className="btn-primary w-full">Я оплатил</SubmitButton>
                <p className="text-xs text-muted">Тариф включится сразу на {GRACE_DAYS} дня, после сверки перевода — на весь срок. Чек самозанятого придёт по ссылке в разделе «Тариф и оплата».</p>
              </ActionForm>
            </div>
          </>
        )}
        <Link href="/app/billing" className="btn-ghost">← К тарифам</Link>
      </div>
    </>
  );
}

function Row({ label, value, copy }: { label: string; value: string; copy?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line pb-3 last:border-0 last:pb-0">
      <div className="min-w-0">
        <div className="label">{label}</div>
        <div className="break-all font-mono text-lg">{value}</div>
      </div>
      {copy && <CopyButton text={copy} />}
    </div>
  );
}
