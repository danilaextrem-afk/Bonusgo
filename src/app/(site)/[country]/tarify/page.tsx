import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Faq } from "@/components/site/Faq";
import { JsonLd } from "@/components/site/JsonLd";
import { PageHeader } from "@/components/site/PageHeader";
import { PaymentNote, PricingCards, PricingTable } from "@/components/site/PricingTable";
import { Section } from "@/components/site/Section";
import { codeOf, currencyOf, parseCountry, paymentNote } from "@/components/site/site-data";
import { ACTIVE_CUSTOMER_DAYS, PLAN_PRICES } from "@/lib/plans";
import { absoluteUrl, buildMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: { params: Promise<{ country: string }> }): Promise<Metadata> {
  const c = parseCountry((await params).country);
  if (!c) return {};
  return buildMetadata({
    country: c,
    path: "/tarify",
    title: `Тарифы BONUSGO в ${currencyOf(c) === "RUB" ? "рублях" : "белорусских рублях"}`,
    description: "Бесплатный тариф и платные PRO и TOP: лимиты клиентов, программ и сотрудников, сравнение возможностей и способы оплаты.",
  });
}

export default async function Page({ params }: { params: Promise<{ country: string }> }) {
  const c = parseCountry((await params).country);
  if (!c) notFound();
  const currency = currencyOf(c);
  const prices = PLAN_PRICES[codeOf(c)];
  const offer = (name: string, minor: number) => ({
    "@type": "Offer",
    name,
    price: (minor / 100).toFixed(2),
    priceCurrency: currency,
    url: absoluteUrl(`/${c}/tarify`),
    availability: "https://schema.org/InStock",
  });
  const ld = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: "BONUSGO — цифровые бонусные карты",
    description: "Сервис цифровых бонусных карт и программ лояльности для малого бизнеса.",
    brand: { "@type": "Brand", name: "BONUSGO" },
    offers: [offer("Бесплатный", 0), offer("PRO", prices.PRO), offer("TOP", prices.TOP)],
  };
  const faq = [
    { q: "Кого считают активным клиентом?", a: `Клиента, у которого за последние ${ACTIVE_CUSTOMER_DAYS} дней была активность по карте. Лимиты тарифов считаются именно по активным клиентам.` },
    { q: "Как оплатить платный тариф?", a: `${paymentNote(c)}.` },
    { q: "Нужна ли карта для бесплатного тарифа?", a: "Нет. Бесплатный тариф доступен без оплаты и привязки банковской карты." },
  ];
  return (
    <>
      <PageHeader
        crumbs={[{ name: "Главная", href: `/${c}` }, { name: "Тарифы" }]}
        h1="Тарифы BONUSGO"
        lead={`Цены указаны в ${currency === "RUB" ? "российских рублях" : "белорусских рублях"} за месяц. Начните бесплатно и переходите на платный тариф, когда клиентов станет больше.`}
      />
      <Section>
        <PricingCards country={c} />
        <div className="mt-6"><PaymentNote country={c} /></div>
      </Section>
      <Section title="Сравнение тарифов" tone="alt">
        <PricingTable country={c} />
      </Section>
      <Section title="Вопросы по тарифам">
        <div className="max-w-3xl"><Faq items={faq} /></div>
      </Section>
      <JsonLd data={ld} />
    </>
  );
}
