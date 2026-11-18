import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/app/ActionForm";
import { SubmitButton } from "@/components/app/SubmitButton";
import { asArray, pick, pStr, pNum, rec } from "@/components/app/adapt";
import { COUNTRY } from "@/lib/plans";
import { getCurrentUser } from "@/server/auth/session";
import { getPublicProgramByVenueSlug } from "@/server/loyalty/service";
import { joinAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Бонусная карта", robots: { index: false, follow: false } };

export default async function VenuePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[a-z0-9-]{1,100}$/i.test(slug)) notFound();
  const data = await getPublicProgramByVenueSlug(slug);
  if (!data) notFound();

  const venue = rec(pick(data, "venue") ?? data);
  const company = rec(pick(data, "company"));
  const programs = asArray(pick(data, "programs") ?? (pick(data, "program") ? [pick(data, "program")] : []));
  const color = /^#[0-9a-fA-F]{6}$/.test(pStr(venue, "brandColor")) ? pStr(venue, "brandColor") : "#39FF88";
  const logo = pStr(venue, "logoUrl");
  const plan = pStr(data, "plan") || pStr(company, "plan");
  const showFooter = pick(data, "showBranding") !== undefined ? !!pick(data, "showBranding") : plan === "" || plan === "FREE";
  const country = pStr(company, "country") || pStr(data, "country");
  const home = country === "BY" ? COUNTRY.BY.path : COUNTRY.RU.path;
  const user = await getCurrentUser();

  return (
    <main className="container-x flex min-h-dvh max-w-md flex-col py-8">
      <div className="card flex-1 text-center" style={{ borderColor: `${color}66` }}>
        {logo.startsWith("data:image/") ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt="" className="mx-auto mb-4 h-20 w-20 rounded-2xl object-cover" />
        ) : (
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-2xl text-3xl font-bold text-black" style={{ background: color }} aria-hidden>
            {pStr(venue, "name").slice(0, 1).toUpperCase()}
          </div>
        )}
        <h1 className="text-2xl font-bold">{pStr(venue, "name")}</h1>
        {pStr(venue, "address") && <p className="mt-1 text-sm text-muted">{pStr(venue, "address")}</p>}

        <div className="mt-6 space-y-4 text-left">
          {programs.length === 0 && <p className="text-center text-sm text-muted">Бонусная программа скоро появится.</p>}
          {programs.map((p) => {
            const id = pStr(p, "id");
            const isStamps = pStr(p, "type") === "STAMPS";
            return (
              <div key={id} className="rounded-2xl border border-line bg-surface-2 p-4">
                <div className="font-semibold">{pStr(p, "name")}</div>
                <p className="mt-1 text-sm text-muted">
                  {isStamps ? `Собирайте штампы: ${pNum(p, "stampsRequired")} визитов — ${pStr(p, "rewardText")}.` : `Получайте ${pNum(p, "pointsPercent")}% баллами с каждой покупки и обменивайте на награды.`}
                </p>
                {user ? (
                  <ActionForm action={joinAction} className="mt-3">
                    <input type="hidden" name="programId" value={id} />
                    <input type="hidden" name="slug" value={slug} />
                    <SubmitButton className="btn w-full bg-neon text-black" pendingText="Оформляем…">Получить карту</SubmitButton>
                  </ActionForm>
                ) : (
                  <Link href={`/register?role=customer&next=${encodeURIComponent(`/v/${slug}`)}`} className="btn mt-3 w-full text-black" style={{ background: color }}>Получить карту</Link>
                )}
              </div>
            );
          })}
        </div>
        {!user && (
          <p className="mt-4 text-xs text-muted">Уже есть аккаунт? <Link className="underline underline-offset-4" href={`/login?next=${encodeURIComponent(`/v/${slug}`)}`}>Войти</Link></p>
        )}
      </div>
      {showFooter && (
        <p className="mt-4 text-center text-xs text-muted">
          <Link href={`/${home}`} className="underline underline-offset-4">Создать свою бонусную карту — QRonus</Link>
        </p>
      )}
    </main>
  );
}
