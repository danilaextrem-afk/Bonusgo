import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SeoPageView } from "@/components/site/SeoPageView";
import { allSeoPages, getPage } from "@/components/site/content-loader";
import { parseCountry } from "@/components/site/site-data";
import { buildMetadata } from "@/lib/seo";

export const dynamicParams = false;

export function generateStaticParams() {
  return allSeoPages().filter((p) => p.kind === "article").flatMap((p) => p.countries.map((country) => ({ country, slug: p.slug })));
}

export async function generateMetadata({ params }: { params: Promise<{ country: string; slug: string }> }): Promise<Metadata> {
  const { country, slug } = await params;
  const c = parseCountry(country);
  const page = c ? getPage("article", slug, c) : undefined;
  if (!c || !page) return {};
  return buildMetadata({ country: c, path: `/baza-znaniy/${slug}`, title: page.title, description: page.description, alternates: page.countries, type: "article", modified: page.updated });
}

export default async function Page({ params }: { params: Promise<{ country: string; slug: string }> }) {
  const { country, slug } = await params;
  const c = parseCountry(country);
  const page = c ? getPage("article", slug, c) : undefined;
  if (!c || !page) notFound();
  return <SeoPageView page={page} />;
}
