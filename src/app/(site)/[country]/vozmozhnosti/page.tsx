import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Icon, type IconName } from "@/components/site/icons";
import { PageHeader } from "@/components/site/PageHeader";
import { Section } from "@/components/site/Section";
import { parseCountry, registerHref } from "@/components/site/site-data";
import { buildMetadata } from "@/lib/seo";
import { PLAN_LIMITS } from "@/lib/plans";

export async function generateMetadata({ params }: { params: Promise<{ country: string }> }): Promise<Metadata> {
  const c = parseCountry((await params).country);
  if (!c) return {};
  return buildMetadata({
    country: c,
    path: "/vozmozhnosti",
    title: "Возможности цифровой бонусной карты",
    description: "Штампы и баллы, награды, подтверждение начисления сотрудником, одноразовый QR клиента, аналитика визитов. Что умеет BONUSGO.",
  });
}

const GROUPS: { icon: IconName; title: string; items: string[] }[] = [
  { icon: "phone", title: "Карта у клиента", items: ["Открывается по QR в браузере телефона", "Не нужно скачивать приложение", "Штампы или баллы, награда и прогресс на одном экране"] },
  { icon: "shield", title: "Защита от накруток", items: ["Начисление только после подтверждения сотрудником", "Одноразовый QR клиента, обновляется после использования", "История начислений для разбора спорных случаев (платные тарифы)"] },
  { icon: "gift", title: "Программы и награды", items: ["Накопительные штампы «каждый N-й бесплатно»", "Накопление баллами (платные тарифы)", "Награды и их выдача на кассе (платные тарифы)"] },
  { icon: "users", title: "Команда", items: ["Сотрудники-кассиры с отдельными доступами (платные тарифы)", "Несколько программ и заведений на старших тарифах", "Каждый сотрудник подтверждает начисления от своего имени"] },
  { icon: "chart", title: "Аналитика", items: ["Число клиентов, визитов и выданных наград", "Расширенная аналитика на платных тарифах", "Экспорт данных на тарифе TOP"] },
  { icon: "printer", title: "Печатные материалы", items: ["QR-код для точки", "Плакат А5 с названием вашего заведения: бесплатный инструмент", "Свой цвет и оформление карты (платные тарифы)"] },
];

export default async function Page({ params }: { params: Promise<{ country: string }> }) {
  const c = parseCountry((await params).country);
  if (!c) notFound();
  return (
    <>
      <PageHeader
        crumbs={[{ name: "Главная", href: `/${c}` }, { name: "Возможности" }]}
        h1="Возможности BONUSGO"
        lead="Простая программа лояльности для малого бизнеса: клиент не устанавливает приложение, а сотрудник контролирует каждое начисление."
      />
      <Section>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {GROUPS.map((g) => (
            <section key={g.title} className="card" aria-labelledby={`g-${g.icon}`}>
              <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-neon/40 bg-neon/10 text-neon"><Icon name={g.icon} /></span>
              <h2 id={`g-${g.icon}`} className="mt-4 text-lg font-bold text-text">{g.title}</h2>
              <ul className="mt-3 space-y-2 text-sm text-muted">
                {g.items.map((i) => (
                  <li key={i} className="flex gap-2"><Icon name="check" size={16} className="mt-0.5 shrink-0 text-neon" />{i}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <p className="mt-6 text-sm text-muted">
          Бесплатный тариф включает {PLAN_LIMITS.FREE.programs} программу и до {PLAN_LIMITS.FREE.activeCustomers} активных клиентов. Полное сравнение возможностей — на странице <Link href={`/${c}/tarify`} className="text-neon hover:underline">«Тарифы»</Link>.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href={registerHref(c)} className="btn-primary">Создать карту бесплатно</Link>
          <Link href={`/${c}/demo`} className="btn-ghost">Попробовать демо</Link>
        </div>
      </Section>
    </>
  );
}
