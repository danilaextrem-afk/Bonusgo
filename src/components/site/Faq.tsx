import { JsonLd } from "./JsonLd";

export interface FaqItem {
  q: string;
  a: string;
}

export function faqJsonLd(items: FaqItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((i) => ({
      "@type": "Question",
      name: i.q,
      acceptedAnswer: { "@type": "Answer", text: i.a },
    })),
  };
}

export function Faq({ items, jsonLd = true }: { items: FaqItem[]; jsonLd?: boolean }) {
  if (items.length === 0) return null;
  return (
    <div className="divide-y divide-line overflow-hidden rounded-[18px] border border-line bg-surface">
      {items.map((item) => (
        <details key={item.q} className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-left text-base font-semibold text-text hover:text-neon [&::-webkit-details-marker]:hidden">
            <span>{item.q}</span>
            <span aria-hidden="true" className="shrink-0 text-xl leading-none text-neon transition-transform group-open:rotate-45">
              +
            </span>
          </summary>
          <p className="px-5 pb-5 text-sm leading-relaxed text-muted sm:text-base">{item.a}</p>
        </details>
      ))}
      {jsonLd && <JsonLd data={faqJsonLd(items)} />}
    </div>
  );
}
