import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/site/PageHeader";
import { Section } from "@/components/site/Section";
import { formatRuDate, listPages, pageHref } from "@/components/site/content-loader";
import { parseCountry } from "@/components/site/site-data";
import { buildMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: { params: Promise<{ country: string }> }): Promise<Metadata> {
  const c = parseCountry((await params).country);
  if (!c) return {};
  return buildMetadata({
    country: c,
    path: "/baza-znaniy",
    title: "База знаний: программы лояльности для бизнеса",
    description: "Статьи о бонусных картах, программах лояльности и удержании клиентов для владельцев кофеен, салонов, автомоек и магазинов.",
  });
}

export default async function Page({ params }: { params: Promise<{ country: string }> }) {
  const c = parseCountry((await params).country);
  if (!c) notFound();
  const articles = listPages("article", c).sort((a, b) => b.updated.localeCompare(a.updated));
  return (
    <>
      <PageHeader crumbs={[{ name: "Главная", href: `/${c}` }, { name: "База знаний" }]} h1="База знаний" lead="Практические материалы о программах лояльности и бонусных картах для малого бизнеса." />
      <Section>
        {articles.length === 0 ? (
          <p className="card max-w-xl text-muted">Статьи скоро появятся. Пока можно воспользоваться <Link className="text-neon hover:underline" href={`/${c}/instrumenty`}>бесплатными инструментами</Link>.</p>
        ) : (
          <ul className="grid gap-4 md:grid-cols-2">
            {articles.map((a) => (
              <li key={a.slug}>
                <Link href={pageHref(c, a)} className="card block h-full transition hover:border-neon/60">
                  <h2 className="text-lg font-bold text-text">{a.h1}</h2>
                  <p className="mt-2 text-sm text-muted">{a.description}</p>
                  <p className="mt-3 text-xs text-muted">Обновлено: {formatRuDate(a.updated)}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}
