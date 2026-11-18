import { seoPages } from "@/content/seo";
import type { Block, SeoPage } from "@/content/types";
import { RESERVED_SLUGS, type CP } from "./site-data";

export interface ResolvedPage extends SeoPage {
  country: CP;
  extra: Block[];
}

const unique: SeoPage[] = (() => {
  const seen = new Set<string>();
  const out: SeoPage[] = [];
  for (const p of seoPages) {
    const key = `${p.kind}:${p.slug}`;
    if (seen.has(key)) continue;
    if (p.kind === "landing" && RESERVED_SLUGS.has(p.slug)) continue;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(p.slug)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
})();

export function resolvePage(page: SeoPage, country: CP): ResolvedPage {
  const o = page.regional?.[country];
  return {
    ...page,
    country,
    title: o?.title ?? page.title,
    description: o?.description ?? page.description,
    h1: o?.h1 ?? page.h1,
    lead: o?.lead ?? page.lead,
    extra: o?.extra ?? [],
  };
}

export function listPages(kind: SeoPage["kind"], country: CP): ResolvedPage[] {
  return unique.filter((p) => p.kind === kind && p.countries.includes(country)).map((p) => resolvePage(p, country));
}

export function getPage(kind: SeoPage["kind"], slug: string, country: CP): ResolvedPage | undefined {
  const p = unique.find((x) => x.kind === kind && x.slug === slug && x.countries.includes(country));
  return p ? resolvePage(p, country) : undefined;
}

export function allSeoPages(): SeoPage[] {
  return unique;
}

export function pageHref(country: CP, page: Pick<SeoPage, "kind" | "slug">): string {
  return page.kind === "article" ? `/${country}/baza-znaniy/${page.slug}` : `/${country}/${page.slug}`;
}

export function pagePath(page: Pick<SeoPage, "kind" | "slug">): string {
  return page.kind === "article" ? `/baza-znaniy/${page.slug}` : `/${page.slug}`;
}

/** Content paths (without country prefix) that exist in both countries. */
export function sharedContentPaths(): string[] {
  return unique.filter((p) => p.countries.includes("ru") && p.countries.includes("by")).map(pagePath);
}

/** Pages related to `page`, only those that exist in the same country. */
export function relatedPages(page: ResolvedPage): ResolvedPage[] {
  const out: ResolvedPage[] = [];
  for (const slug of page.related) {
    const hit = getPage("landing", slug, page.country) ?? getPage("article", slug, page.country);
    if (hit && !(hit.slug === page.slug && hit.kind === page.kind)) out.push(hit);
  }
  return out;
}

export function formatRuDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(d);
}
