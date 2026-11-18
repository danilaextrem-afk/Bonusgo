import { ActionForm } from "@/components/app/ActionForm";
import { SubmitButton } from "@/components/app/SubmitButton";
import { Field, PageHeader } from "@/components/app/ui";
import { requireUser } from "@/server/auth/session";
import { deleteAccountAction } from "../../auth-actions";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await requireUser();
  return (
    <>
      <PageHeader title="Профиль" />
      <div className="space-y-4">
        <div className="card text-sm">
          <div className="text-muted">Имя</div>
          <div className="mb-3">{user.name || "—"}</div>
          <div className="text-muted">Email</div>
          <div>{user.email}</div>
        </div>
        <div className="card border-danger/30">
          <h2 className="mb-1 font-semibold text-danger">Удалить мои данные</h2>
          <p className="mb-3 text-sm text-muted">Аккаунт, карты и баланс бонусов будут удалены без возможности восстановления.</p>
          <ActionForm action={deleteAccountAction} className="space-y-3" confirm="Точно удалить аккаунт и данные? Это нельзя отменить.">
            <Field label="Для подтверждения введите слово УДАЛИТЬ"><input className="input" name="confirm" autoComplete="off" required /></Field>
            <SubmitButton className="btn border border-danger/60 text-danger hover:bg-danger/10">Удалить мои данные</SubmitButton>
          </ActionForm>
        </div>
      </div>
    </>
  );
}
