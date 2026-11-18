import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Faq } from "@/components/site/Faq";
import { PageHeader } from "@/components/site/PageHeader";
import { Section } from "@/components/site/Section";
import { ToolEmbed } from "@/components/site/ToolEmbed";
import { listPages, pageHref } from "@/components/site/content-loader";
import { TOOLS, parseCountry, registerHref, toolMeta } from "@/components/site/site-data";
import { COUNTRY_PATHS, buildMetadata } from "@/lib/seo";

export const dynamicParams = false;

export function generateStaticParams() {
  return COUNTRY_PATHS.flatMap((country) => TOOLS.map((t) => ({ country, tool: t.key })));
}

export async function generateMetadata({ params }: { params: Promise<{ country: string; tool: string }> }): Promise<Metadata> {
  const p = await params;
  const c = parseCountry(p.country);
  const t = toolMeta(p.tool);
  if (!c || !t) return {};
  return buildMetadata({ country: c, path: `/instrumenty/${t.key}`, title: t.title, description: t.description });
}

export default async function Page({ params }: { params: Promise<{ country: string; tool: string }> }) {
  const p = await params;
  const c = parseCountry(p.country);
  const t = toolMeta(p.tool);
  if (!c || !t) notFound();
  return (
    <>
      <PageHeader
        crumbs={[{ name: "Главная", href: `/${c}` }, { name: "Инструменты", href: `/${c}/instrumenty` }, { name: t.title }]}
        h1={t.h1}
        lead={t.short}
      />
      <Section className="!pt-4">
        <ToolEmbed tool={t.key} country={c} shareable />
      </Section>
      <Section title="Как считается" tone="alt">
        <ul className="max-w-3xl list-disc space-y-3 pl-5 text-[#cfd6da] marker:text-neon">
          {t.formula.map((f) => <li key={f}>{f}</li>)}
        </ul>
        <aside className="mt-6 max-w-3xl rounded-[18px] border border-line border-l-[3px] border-l-neon bg-surface p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-neon">Пример</p>
          <p className="mt-2 text-[15px] leading-relaxed text-muted">{c === "by" && t.exampleBy ? t.exampleBy : t.example}</p>
        </aside>
      </Section>
      <Section title="Вопросы и ответы">
        <div className="max-w-3xl"><Faq items={t.faq} /></div>
      </Section>
      <Section title="Читайте также" tone="alt">
        <ul className="flex flex-wrap gap-3">
          {t.related.map((r) => (
            <li key={r.href}><Link className="btn-ghost" href={`/${c}${r.href}`}>{r.label}</Link></li>
          ))}
          {listPages("landing", c).slice(0, 4).map((l) => (
            <li key={l.slug}><Link className="btn-ghost" href={pageHref(c, l)}>{l.h1}</Link></li>
          ))}
          <li><Link className="btn-primary" href={registerHref(c)}>Создать карту бесплатно</Link></li>
        </ul>
      </Section>
    </>
  );
}
