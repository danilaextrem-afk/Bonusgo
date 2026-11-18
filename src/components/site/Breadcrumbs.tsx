import Link from "next/link";
import { absoluteUrl } from "@/lib/seo";
import { JsonLd } from "./JsonLd";

export interface Crumb {
  name: string;
  href?: string;
}

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  const ld = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      ...(c.href ? { item: absoluteUrl(c.href) } : {}),
    })),
  };
  return (
    <nav aria-label="Хлебные крошки" className="container-x pt-6 text-sm text-muted">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {items.map((c, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${c.name}-${i}`} className="flex items-center gap-2">
              {c.href && !last ? (
                <Link href={c.href} className="inline-flex min-h-10 items-center hover:text-neon">
                  {c.name}
                </Link>
              ) : (
                <span aria-current={last ? "page" : undefined} className={last ? "text-text" : ""}>
                  {c.name}
                </span>
              )}
              {!last && <span aria-hidden="true">/</span>}
            </li>
          );
        })}
      </ol>
      <JsonLd data={ld} />
    </nav>
  );
}
