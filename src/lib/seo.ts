import type { Metadata } from "next";

export type CP = "ru" | "by";
export const COUNTRY_PATHS: CP[] = ["ru", "by"];

export const SITE_URL = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
export const SITE_NAME = "QRonus";

export function absoluteUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Path inside a country: "" -> /ru, "/tarify" -> /ru/tarify. */
export function countryPath(country: CP, path = ""): string {
  const p = path === "/" ? "" : path;
  return `/${country}${p}`;
}

export interface MetaInput {
  /** null for the x-default chooser page at "/". */
  country: CP | null;
  /** Path inside the country ("" for home, "/tarify", "/baza-znaniy/x"). */
  path: string;
  title: string;
  description: string;
  /** Countries in which this page really exists. Default both. */
  alternates?: CP[];
  noindex?: boolean;
  type?: "website" | "article";
  modified?: string;
}

const OG_LOCALE: Record<CP, string> = { ru: "ru_RU", by: "ru_BY" };

function withBrand(title: string): string {
  if (/qronus/i.test(title)) return title;
  return title.length + 10 <= 65 ? `${title} — QRonus` : title;
}

export function buildMetadata(input: MetaInput): Metadata {
  const { country, path, description, noindex, type = "website", modified } = input;
  const alternates = input.alternates ?? COUNTRY_PATHS;
  const title = withBrand(input.title);
  const canonicalPath = country ? countryPath(country, path) : "/";
  const canonical = absoluteUrl(canonicalPath);

  let languages: Record<string, string> | undefined;
  if (alternates.includes("ru") && alternates.includes("by")) {
    languages = {
      "ru-RU": absoluteUrl(countryPath("ru", path)),
      "ru-BY": absoluteUrl(countryPath("by", path)),
      // x-default: the chooser for the home page, the Russian version for every other page.
      "x-default": absoluteUrl(!country || path === "" || path === "/" ? "/" : countryPath("ru", path)),
    };
  }

  const images = [{ url: absoluteUrl("/opengraph-image"), width: 1200, height: 630, alt: "QRonus" }];
  const meta: Metadata = {
    title: { absolute: title },
    description,
    alternates: { canonical, ...(languages ? { languages } : {}) },
    openGraph: {
      type,
      url: canonical,
      title,
      description,
      siteName: SITE_NAME,
      locale: country ? OG_LOCALE[country] : "ru_RU",
      alternateLocale: country ? [OG_LOCALE[country === "ru" ? "by" : "ru"]] : ["ru_BY"],
      images,
      ...(type === "article" && modified ? { modifiedTime: modified } : {}),
    },
    twitter: { card: "summary_large_image", title, description, images: images.map((i) => i.url) },
  };
  if (noindex) meta.robots = { index: false, follow: true };
  return meta;
}
