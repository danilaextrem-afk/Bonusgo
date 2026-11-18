import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/site/PageHeader";
import { Section } from "@/components/site/Section";
import { loadLegal } from "@/components/site/legal";
import { renderMarkdown } from "@/components/site/markdown";
import { parseCountry } from "@/components/site/site-data";
import { buildMetadata } from "@/lib/seo";

const TITLE = "Политика использования cookies";

export async function generateMetadata({ params }: { params: Promise<{ country: string }> }): Promise<Metadata> {
  const c = parseCountry((await params).country);
  if (!c) return {};
  const doc = await loadLegal("cookies", c);
  return buildMetadata({ country: c, path: "/cookies", title: TITLE, description: "Какие cookies использует сайт QRonus, зачем они нужны и как отказаться от аналитики.", noindex: !doc });
}

export default async function Page({ params }: { params: Promise<{ country: string }> }) {
  const c = parseCountry((await params).country);
  if (!c) notFound();
  const doc = await loadLegal("cookies", c);
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
