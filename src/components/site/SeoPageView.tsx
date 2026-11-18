import Link from "next/link";
import { Breadcrumbs } from "./Breadcrumbs";
import { Blocks } from "./Blocks";
import { Faq, faqJsonLd } from "./Faq";
import { JsonLd } from "./JsonLd";
import { formatRuDate, pageHref, relatedPages, type ResolvedPage } from "./content-loader";
import { registerHref } from "./site-data";
import { SITE_NAME, absoluteUrl } from "@/lib/seo";

export function SeoPageView({ page }: { page: ResolvedPage }) {
  const c = page.country;
  const isArticle = page.kind === "article";
  const related = relatedPages(page);
  const self = pageHref(c, page);
  const crumbs = [
    { name: "Главная", href: `/${c}` },
    isArticle ? { name: "База знаний", href: `/${c}/baza-znaniy` } : { name: "Решения", href: `/${c}/resheniya` },
    { name: page.h1 },
  ];
  const articleLd = isArticle
    ? {
        "@context": "https://schema.org",
        "@type": "Article",
        headline: page.h1,
        description: page.description,
        dateModified: page.updated,
        inLanguage: page.country === "by" ? "ru-BY" : "ru-RU",
        mainEntityOfPage: absoluteUrl(self),
        publisher: { "@type": "Organization", name: SITE_NAME, url: absoluteUrl("/") },
      }
    : null;
  return (
    <>
      <Breadcrumbs items={crumbs} />
      <article className="container-x max-w-3xl py-10 sm:py-14">
        <header>
          <h1 className="text-3xl font-extrabold leading-tight tracking-tight text-text sm:text-5xl">{page.h1}</h1>
          <p className="mt-4 text-lg leading-relaxed text-muted">{page.lead}</p>
          <p className="mt-4 text-sm text-muted">Обновлено: <time dateTime={page.updated}>{formatRuDate(page.updated)}</time></p>
        </header>
        <div className="mt-8">
          <Blocks blocks={[...page.blocks, ...page.extra]} country={c} />
        </div>
        {page.faq.length > 0 && (
          <section aria-labelledby="page-faq" className="mt-14">
            <h2 id="page-faq" className="mb-5 text-2xl font-bold text-text">Частые вопросы</h2>
            <Faq items={page.faq} jsonLd={false} />
            <JsonLd data={faqJsonLd(page.faq)} />
          </section>
        )}
        {!isArticle && (
          <div className="card mt-12 text-center">
            <p className="text-xl font-bold text-text">Запустите бонусную карту сегодня</p>
            <p className="mt-2 text-sm text-muted">Бесплатный тариф, без приложения для клиентов.</p>
            <Link href={registerHref(c)} className="btn-primary mt-5">Создать карту бесплатно</Link>
          </div>
        )}
        {related.length > 0 && (
          <nav aria-labelledby="page-related" className="mt-12">
            <h2 id="page-related" className="mb-4 text-lg font-bold text-text">Читайте также</h2>
            <ul className="grid gap-3 sm:grid-cols-2">
              {related.map((r) => (
                <li key={`${r.kind}-${r.slug}`}>
                  <Link href={pageHref(c, r)} className="card block h-full !p-4 transition hover:border-neon/60">
                    <span className="font-semibold text-text">{r.h1}</span>
                    <span className="mt-1 block text-sm text-muted">{r.description}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </article>
      {articleLd && <JsonLd data={articleLd} />}
    </>
  );
}
