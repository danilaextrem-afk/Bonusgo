import { ActionForm } from "@/components/app/ActionForm";
import { CopyButton } from "@/components/app/CopyButton";
import { SubmitButton } from "@/components/app/SubmitButton";
import { Field, PageHeader } from "@/components/app/ui";
import { requireCompanyContext } from "@/components/app/data";
import { appUrl } from "@/components/app/safe";
import { COUNTRY } from "@/lib/plans";
import { deleteAccountAction } from "../../auth-actions";
import { updateCompanyAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { company, role, user } = await requireCompanyContext();
  const isOwner = role === "OWNER";
  const refLink = `${appUrl()}/${COUNTRY[company.country].path}?ref=${company.referralCode}`;
  return (
    <>
      <PageHeader title="Настройки" />
      <div className="space-y-4">
        <div className="card">
          <h2 className="mb-3 font-semibold">Компания</h2>
          <ActionForm action={updateCompanyAction} className="space-y-4">
            <input type="hidden" name="companyId" value={company.id} />
            <Field label="Название"><input className="input" name="name" defaultValue={company.name} required minLength={2} maxLength={80} disabled={!isOwner} /></Field>
            <Field label="Юридическое название"><input className="input" name="legalName" defaultValue={company.legalName ?? ""} maxLength={120} disabled={!isOwner} /></Field>
            <Field label={COUNTRY[company.country].taxIdLabel}><input className="input" name="taxId" defaultValue={company.taxId ?? ""} inputMode="numeric" maxLength={12} disabled={!isOwner} /></Field>
            <p className="text-xs text-muted">Страна и валюта: {COUNTRY[company.country].name}, {COUNTRY[company.country].currency} (менять нельзя).</p>
            {isOwner ? <SubmitButton>Сохранить</SubmitButton> : <p className="text-xs text-muted">Менять данные компании может только владелец.</p>}
          </ActionForm>
        </div>

        <div className="card">
          <h2 className="mb-1 font-semibold">Пригласите другой бизнес</h2>
          <p className="mb-3 text-sm text-muted">Поделитесь ссылкой. +30 дней подписки после первой оплаты приглашённого бизнеса.</p>
          <p className="mb-3 break-all rounded-xl border border-line bg-surface-2 px-3 py-2 font-mono text-xs">{refLink}</p>
          <CopyButton text={refLink} label="Копировать ссылку" />
        </div>

        <div className="card border-danger/30">
          <h2 className="mb-1 font-semibold text-danger">Удалить аккаунт</h2>
          <p className="mb-3 text-sm text-muted">Мы удалим ваш профиль ({user.email}) и связанные персональные данные. Если вы владелец, данные компании тоже будут удалены. Это необратимо.</p>
          <ActionForm action={deleteAccountAction} className="space-y-3" confirm="Точно удалить аккаунт и данные? Это нельзя отменить.">
            <Field label="Для подтверждения введите слово УДАЛИТЬ"><input className="input" name="confirm" autoComplete="off" required /></Field>
            <SubmitButton className="btn border border-danger/60 text-danger hover:bg-danger/10">Удалить аккаунт</SubmitButton>
          </ActionForm>
        </div>
      </div>
    </>
  );
}
