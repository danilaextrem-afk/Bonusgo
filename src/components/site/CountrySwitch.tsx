"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { CP } from "@/lib/seo";

const LABEL: Record<CP, string> = { ru: "Россия", by: "Беларусь" };

/**
 * Keeps the same path when the page exists in the other country.
 * `shared` lists content paths that exist in BOTH countries (static pages always do).
 */
export function CountrySwitch({ country, shared, staticPaths }: { country: CP; shared: string[]; staticPaths: string[] }) {
  const pathname = usePathname() || `/${country}`;
  const rest = pathname.replace(/^\/(ru|by)/, "") || "";
  const known = new Set([...staticPaths, ...shared]);
  const isTool = /^\/instrumenty\/[a-z-]+$/.test(rest);
  const target = (c: CP) => (rest === "" || known.has(rest) || isTool ? `/${c}${rest}` : `/${c}`);
  return (
    <div role="group" aria-label="Страна" className="inline-flex rounded-lg border border-line p-0.5 text-xs">
      {(["ru", "by"] as CP[]).map((c) => (
        <Link
          key={c}
          href={target(c)}
          hrefLang={c === "ru" ? "ru-RU" : "ru-BY"}
          aria-current={c === country ? "true" : undefined}
          className={`inline-flex min-h-10 items-center rounded-md px-3 font-medium transition ${c === country ? "bg-neon text-black" : "text-muted hover:text-neon"}`}
        >
          {LABEL[c]}
        </Link>
      ))}
    </div>
  );
}
