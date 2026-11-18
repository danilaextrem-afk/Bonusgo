import type { MetadataRoute } from "next";
import { allSeoPages, pagePath } from "@/components/site/content-loader";
import { LAST_SITE_UPDATE, STATIC_PAGES, TOOLS } from "@/components/site/site-data";
import { COUNTRY_PATHS, absoluteUrl, countryPath, type CP } from "@/lib/seo";

type Entry = MetadataRoute.Sitemap[number];

function entry(path: string, countries: CP[], lastModified: Date, changeFrequency: Entry["changeFrequency"], priority: number): Entry[] {
  const both = countries.includes("ru") && countries.includes("by");
  return countries.map((c) => ({
    url: absoluteUrl(countryPath(c, path)),
    lastModified,
    changeFrequency,
    priority,
    ...(both
      ? {
          alternates: {
            languages: {
              "ru-RU": absoluteUrl(countryPath("ru", path)),
              "ru-BY": absoluteUrl(countryPath("by", path)),
            },
          },
        }
      : {}),
  }));
}

export default function sitemap(): MetadataRoute.Sitemap {
  const base = new Date(LAST_SITE_UPDATE);
  const out: MetadataRoute.Sitemap = [
    {
      url: absoluteUrl("/"),
      lastModified: base,
      changeFrequency: "monthly",
      priority: 1,
      alternates: { languages: { "ru-RU": absoluteUrl("/ru"), "ru-BY": absoluteUrl("/by") } },
    },
  ];
  for (const p of STATIC_PAGES) out.push(...entry(p.path, COUNTRY_PATHS, base, p.changeFrequency, p.priority));
  for (const t of TOOLS) out.push(...entry(`/instrumenty/${t.key}`, COUNTRY_PATHS, base, "monthly", 0.7));
  for (const page of allSeoPages()) {
    const d = new Date(page.updated);
    out.push(...entry(pagePath(page), page.countries, Number.isNaN(d.getTime()) ? base : d, "monthly", page.kind === "landing" ? 0.8 : 0.6));
  }
  return out;
}
