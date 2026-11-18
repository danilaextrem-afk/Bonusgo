import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/site/PageHeader";
import { Section } from "@/components/site/Section";
import { loadLegal } from "@/components/site/legal";
import { renderMarkdown } from "@/components/site/markdown";
import { parseCountry } from "@/components/site/site-data";
import { buildMetadata } from "@/lib/seo";

const TITLE = "Политика конфиденциальности";

export async function generateMetadata({ params }: { params: Promise<{ country: string }> }): Promise<Metadata> {
  const c = parseCountry((await params).country);
  if (!c) return {};
  const doc = await loadLegal("privacy", c);
  return buildMetadata({ country: c, path: "/politika-konfidencialnosti", title: TITLE, description: "Как QRonus собирает, использует и защищает персональные данные пользователей сервиса.", noindex: !doc });
}

export default async function Page({ params }: { params: Promise<{ country: string }> }) {
  const c = parseCountry((await params).country);
  if (!c) notFound();
  const doc = await loadLegal("privacy", c);
  return (
    <>
      <PageHeader crumbs={[{ name: "Главная", href: `/${c}` }, { name: TITLE }]} h1={TITLE} />
      <Section className="!pt-2">
        <div className="max-w-3xl text-base leading-relaxed text-[#cfd6da]">
          {doc ? renderMarkdown(doc) : <p className="card text-muted">Документ готовится.</p>}
        </div>
      </Section>
    </>
  );
}
