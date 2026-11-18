import { SITE_NAME, absoluteUrl } from "@/lib/seo";

export function orgJsonLd() {
  const email = process.env.CONTACT_EMAIL;
  return [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: SITE_NAME,
      url: absoluteUrl("/"),
      description: "Цифровые бонусные карты по QR для малого бизнеса в России и Беларуси.",
      areaServed: ["RU", "BY"],
      ...(email ? { email } : {}),
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: SITE_NAME,
      url: absoluteUrl("/"),
      inLanguage: ["ru-RU", "ru-BY"],
    },
  ];
}
