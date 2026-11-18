import Link from "next/link";
import { ImageUpload } from "./ImageUpload";
import { Field } from "./ui";

export function VenueFields({ canBrand, defaults }: { canBrand: boolean; defaults?: { name?: string; address?: string | null; brandColor?: string; logoUrl?: string | null } }) {
  return (
    <div className="space-y-4">
      <Field label="Название заведения"><input className="input" name="name" required minLength={2} maxLength={80} defaultValue={defaults?.name} placeholder="Кофейня «Зерно»" /></Field>
      <Field label="Адрес"><input className="input" name="address" maxLength={160} defaultValue={defaults?.address ?? ""} placeholder="Москва, ул. Тверская, 1" /></Field>
      {canBrand ? (
        <>
          <Field label="Фирменный цвет"><input className="h-12 w-full cursor-pointer rounded-xl border border-line bg-surface-2 p-1" type="color" name="brandColor" defaultValue={defaults?.brandColor ?? "#39ff88"} /></Field>
          <div>
            <span className="label">Логотип (сожмём до 256 px)</span>
            <ImageUpload name="logoUrl" initial={defaults?.logoUrl} />
          </div>
        </>
      ) : (
        <p className="rounded-xl border border-line bg-surface-2 p-3 text-xs text-muted">
          🔒 Свой цвет и логотип доступны на платных тарифах. <Link href="/app/billing" className="inline-flex min-h-10 items-center text-neon underline underline-offset-4">Улучшить тариф</Link>
        </p>
      )}
    </div>
  );
}
