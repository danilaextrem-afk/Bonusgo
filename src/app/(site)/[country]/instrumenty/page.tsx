import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/site/PageHeader";
import { Section } from "@/components/site/Section";
import { TOOLS, parseCountry } from "@/components/site/site-data";
import { buildMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: { params: Promise<{ country: string }> }): Promise<Metadata> {
  const c = parseCountry((await params).country);
  if (!c) return {};
  return buildMetadata({
    country: c,
    path: "/instrumenty",
    title: "Бесплатные инструменты для программы лояльности",
    description: "Калькуляторы и генераторы: программа лояльности, стоимость бонусной программы, выручка от повторных визитов, QR-код и конструктор карты.",
  });
}

export default async function Page({ params }: { params: Promise<{ country: string }> }) {
  const c = parseCountry((await params).country);
  if (!c) notFound();
  return (
    <>
      <PageHeader crumbs={[{ name: "Главная", href: `/${c}` }, { name: "Инструменты" }]} h1="Бесплатные инструменты" lead="Пять инструментов для владельцев малого бизнеса. Регистрация не нужна, расчёты выполняются в вашем браузере." />
      <Section>
        <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {TOOLS.map((t) => (
            <li key={t.key}>
              <Link href={`/${c}/instrumenty/${t.key}`} className="card block h-full transition hover:border-neon/60">
                <h2 className="text-lg font-bold text-text">{t.title}</h2>
                <p className="mt-2 text-sm text-muted">{t.short}</p>
                <span className="mt-4 inline-block text-sm font-semibold text-neon">Открыть →</span>
              </Link>
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}
