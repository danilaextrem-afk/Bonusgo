import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Faq } from "@/components/site/Faq";
import { PageHeader } from "@/components/site/PageHeader";
import { Section } from "@/components/site/Section";
import { generalFaq, parseCountry } from "@/components/site/site-data";
import { buildMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: { params: Promise<{ country: string }> }): Promise<Metadata> {
  const c = parseCountry((await params).country);
  if (!c) return {};
  return buildMetadata({
    country: c,
    path: "/faq",
    title: "Вопросы и ответы о QRonus",
    description: "Как работает цифровая бонусная карта, защита от накруток, тарифы, оплата и запуск программы лояльности в вашем заведении.",
  });
}

export default async function Page({ params }: { params: Promise<{ country: string }> }) {
  const c = parseCountry((await params).country);
  if (!c) notFound();
  return (
    <>
      <PageHeader crumbs={[{ name: "Главная", href: `/${c}` }, { name: "Вопросы и ответы" }]} h1="Вопросы и ответы" lead="Коротко о том, как работает QRonus, сколько стоит и как защищены начисления." />
      <Section>
        <div className="max-w-3xl"><Faq items={generalFaq(c)} /></div>
      </Section>
    </>
  );
}
