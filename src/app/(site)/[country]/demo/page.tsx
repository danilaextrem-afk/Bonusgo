import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DemoCard } from "@/components/site/DemoCard";
import { PageHeader } from "@/components/site/PageHeader";
import { Section } from "@/components/site/Section";
import { parseCountry, registerHref } from "@/components/site/site-data";
import { buildMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: { params: Promise<{ country: string }> }): Promise<Metadata> {
  const c = parseCountry((await params).country);
  if (!c) return {};
  return buildMetadata({
    country: c,
    path: "/demo",
    title: "Демо бонусной карты: попробуйте за сотрудника",
    description: "Интерактивное демо: подтвердите начисление от лица сотрудника, добавьте штамп и откройте награду. Данные не сохраняются.",
  });
}

export default async function Page({ params }: { params: Promise<{ country: string }> }) {
  const c = parseCountry((await params).country);
  if (!c) notFound();
  return (
    <>
      <PageHeader
        crumbs={[{ name: "Главная", href: `/${c}` }, { name: "Демо" }]}
        h1="Демо: как работает бонусная карта"
        lead="Нажмите «Подтвердить начисление» как сотрудник и посмотрите, как клиент получает штамп. Когда карта заполнится, откроется награда."
      />
      <Section>
        <DemoCard />
        <div className="mt-10 text-center">
          <Link href={registerHref(c)} className="btn-primary">Создать такую карту бесплатно</Link>
        </div>
      </Section>
    </>
  );
}
