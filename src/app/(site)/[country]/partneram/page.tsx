import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Icon, type IconName } from "@/components/site/icons";
import { PageHeader } from "@/components/site/PageHeader";
import { PartnerForm } from "@/components/site/PartnerForm";
import { Section } from "@/components/site/Section";
import { contactEmail, parseCountry } from "@/components/site/site-data";
import { buildMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: { params: Promise<{ country: string }> }): Promise<Metadata> {
  const c = parseCountry((await params).country);
  if (!c) return {};
  return buildMetadata({
    country: c,
    path: "/partneram",
    title: "Партнёрская программа для веб-разработчиков",
    description: "Партнёрская программа BONUSGO для веб-разработчиков, специалистов по автоматизации и консультантов: как работает и как связаться.",
  });
}

const STEPS: { icon: IconName; t: string; d: string }[] = [
  { icon: "users", t: "Рекомендуйте клиентам", d: "Вы работаете с малым бизнесом и видите, где не хватает программы лояльности." },
  { icon: "gift", t: "Подключите их к BONUSGO", d: "Помогите клиенту создать карту, оформить программу и распечатать QR." },
  { icon: "chart", t: "Получайте вознаграждение", d: "Вознаграждение партнёра обсуждается индивидуально, см. условия ниже." },
];

export default async function Page({ params }: { params: Promise<{ country: string }> }) {
  const c = parseCountry((await params).country);
  if (!c) notFound();
  const email = contactEmail();
  return (
    <>
      <PageHeader
        crumbs={[{ name: "Главная", href: `/${c}` }, { name: "Партнёрам" }]}
        h1="Партнёрская программа"
        lead="Для веб-разработчиков, специалистов по автоматизации и консультантов, которые помогают малому бизнесу внедрять программы лояльности."
      />
      <Section title="Как это работает">
        <ol className="grid gap-4 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.t} className="card">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-neon/40 bg-neon/10 text-neon"><Icon name={s.icon} /></span>
              <h3 className="mt-4 font-bold text-text"><span className="sr-only">Шаг {i + 1}: </span>{s.t}</h3>
              <p className="mt-2 text-sm text-muted">{s.d}</p>
            </li>
          ))}
        </ol>
      </Section>
      <Section title="Условия" tone="alt">
        <div className="max-w-3xl space-y-3 text-[#cfd6da]">
          <p>Вознаграждение партнёра может быть выражено в виде бонуса к подписке или доли от выручки с привлечённых клиентов. Конкретные условия обсуждаются индивидуально.</p>
          <p className="text-sm text-muted">Мы не публикуем фиксированных процентов и сроков выплат, пока условия не согласованы с вами письменно.</p>
        </div>
      </Section>
      <Section title="Связаться с нами" intro="Расскажите о себе, и мы ответим по почте.">
        <div className="max-w-xl"><PartnerForm email={email} /></div>
      </Section>
    </>
  );
}
