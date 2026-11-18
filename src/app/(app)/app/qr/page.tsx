import Link from "next/link";
import { QrImage } from "@/components/app/QrImage";
import { CopyButton } from "@/components/app/CopyButton";
import { Empty, PageHeader } from "@/components/app/ui";
import { listVenues, requireCompanyContext, sp1 } from "@/components/app/data";
import { appUrl } from "@/components/app/safe";

export const dynamic = "force-dynamic";

export default async function QrPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const { company } = await requireCompanyContext();
  const venues = await listVenues(company.id);
  if (venues.length === 0) {
    return (
      <>
        <PageHeader title="QR-код и плакат" />
        <Empty>Сначала <Link href="/app/venues" className="text-neon underline underline-offset-4">создайте заведение</Link>.</Empty>
      </>
    );
  }
  const venue = venues.find((v) => v.id === sp1(sp.venue)) ?? venues[0];
  const url = `${appUrl()}/v/${venue.slug}`;
  const dl = (format: string) => `/api/app/poster?venueId=${venue.id}&format=${format}`;
  return (
    <>
      <PageHeader title="QR-код и плакат" subtitle="Гость наводит камеру телефона и получает карту. Приложение не нужно." />
      {venues.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {venues.map((v) => (
            <Link key={v.id} href={`/app/qr?venue=${v.id}`} className={`rounded-xl border px-3 py-2 text-sm ${v.id === venue.id ? "border-neon text-neon" : "border-line text-muted"}`}>{v.name}</Link>
          ))}
        </div>
      )}
      <div className="card grid gap-6 md:grid-cols-[auto_1fr]">
        <QrImage text={url} className="w-64 max-w-full rounded-xl" label={`QR-код заведения ${venue.name}`} />
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">{venue.name}</h2>
          <p className="break-all text-sm text-muted">{url}</p>
          <div className="flex flex-wrap gap-2">
            <CopyButton text={url} label="Копировать ссылку" />
            <a className="btn-ghost" href={dl("png")} download>Скачать PNG</a>
            <a className="btn-primary" href={dl("a4")}>Плакат A4 (PDF)</a>
            <a className="btn-primary" href={dl("a5")}>Плакат A5 (PDF)</a>
          </div>
          <p className="text-xs text-muted">Распечатайте плакат и поставьте у кассы. Метку «Создано в QRonus» можно убрать на тарифе TOP.</p>
        </div>
      </div>
    </>
  );
}
