import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Icon } from "@/components/site/icons";
import { PageHeader } from "@/components/site/PageHeader";
import { Section } from "@/components/site/Section";
import { contactEmail, parseCountry } from "@/components/site/site-data";
import { buildMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: { params: Promise<{ country: string }> }): Promise<Metadata> {
  const c = parseCountry((await params).country);
  if (!c) return {};
  return buildMetadata({ country: c, path: "/kontakty", title: "Контакты QRonus", description: "Как связаться с QRonus: электронная почта для вопросов о сервисе, партнёрстве и поддержке." });
}

export default async function Page({ params }: { params: Promise<{ country: string }> }) {
  const c = parseCountry((await params).country);
  if (!c) notFound();
  const email = contactEmail();
  return (
    <>
      <PageHeader crumbs={[{ name: "Главная", href: `/${c}` }, { name: "Контакты" }]} h1="Контакты" lead="Мы отвечаем на письма по вопросам сервиса, подключения и партнёрства." />
      <Section>
        <div className="card max-w-xl">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-neon/40 bg-neon/10 text-neon"><Icon name="mail" /></span>
            <div>
              <p className="text-xs uppercase tracking-wider text-muted">Электронная почта</p>
              <a href={`mailto:${email}`} className="text-lg font-semibold text-neon hover:underline">{email}</a>
            </div>
          </div>
          <p className="mt-5 text-sm leading-relaxed text-muted">Мы работаем онлайн и не принимаем посетителей в офисе. Реквизиты владельца сервиса указаны в документах: <a className="text-neon hover:underline" href={`/${c}/usloviya`}>условия использования</a>.</p>
        </div>
      </Section>
    </>
  );
}
