import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Icon } from "@/components/site/icons";
import { PageHeader } from "@/components/site/PageHeader";
import { Section } from "@/components/site/Section";
import { listPages, pageHref } from "@/components/site/content-loader";
import { INDUSTRIES, parseCountry } from "@/components/site/site-data";
import { buildMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: { params: Promise<{ country: string }> }): Promise<Metadata> {
  const c = parseCountry((await params).country);
  if (!c) return {};
  return buildMetadata({
    country: c,
    path: "/resheniya",
    title: "Бонусные карты для кофеен, салонов и автомоек",
    description: "Решения QRonus по отраслям: кофейни, барбершопы, салоны красоты, автомойки, кафе и магазины. Примеры программ лояльности.",
  });
}

export default async function Page({ params }: { params: Promise<{ country: string }> }) {
  const c = parseCountry((await params).country);
  if (!c) notFound();
  const landings = listPages("landing", c);
  return (
    <>
      <PageHeader crumbs={[{ name: "Главная", href: `/${c}` }, { name: "Решения" }]} h1="Решения по отраслям" lead="Выберите свою отрасль и посмотрите, как может выглядеть бонусная программа для вашего бизнеса." />
      <Section>
        <div className="grid gap-4 md:grid-cols-2">
          {INDUSTRIES.map((ind) => {
            const pages = landings.filter((p) => (p.industry ?? "general") === ind.key);
            return (
              <section key={ind.key} id={ind.key} aria-labelledby={`${ind.key}-h`} className="card scroll-mt-24">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-neon/40 bg-neon/10 text-neon"><Icon name={ind.icon} /></span>
                  <h2 id={`${ind.key}-h`} className="text-lg font-bold text-text">{ind.name}</h2>
                </div>
                <p className="mt-3 text-sm text-muted">{ind.blurb}</p>
                <p className="mt-1 text-xs text-muted">Например: {ind.example}</p>
                {pages.length > 0 && (
                  <ul className="mt-4 space-y-1.5 border-t border-line pt-4 text-sm">
                    {pages.map((p) => (
                      <li key={p.slug}><Link href={pageHref(c, p)} className="inline-flex min-h-10 items-center text-neon hover:underline">{p.h1}</Link></li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      </Section>
    </>
  );
}
