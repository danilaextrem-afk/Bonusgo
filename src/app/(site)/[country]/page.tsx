import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CardMockup } from "@/components/site/CardMockup";
import { Faq } from "@/components/site/Faq";
import { Icon, type IconName } from "@/components/site/icons";
import { JsonLd } from "@/components/site/JsonLd";
import { Phone } from "@/components/site/Phone";
import { PricingCards } from "@/components/site/PricingTable";
import { Section } from "@/components/site/Section";
import { orgJsonLd } from "@/components/site/org-ld";
import { INDUSTRIES, countryName, generalFaq, parseCountry, registerHref } from "@/components/site/site-data";
import { buildMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: { params: Promise<{ country: string }> }): Promise<Metadata> {
  const c = parseCountry((await params).country);
  if (!c) return {};
  return buildMetadata({
    country: c,
    path: "",
    title: "Цифровые бонусные карты по QR для бизнеса",
    description: `Бонусная карта для кофеен, барбершопов, салонов и автомоек: ${countryName(c)}. Без приложения, начисление подтверждает сотрудник. Бесплатный тариф.`,
  });
}

const STEPS: { icon: IconName; title: string; text: string }[] = [
  { icon: "gift", title: "Создайте программу", text: "Выберите штампы или баллы, задайте награду и оформите карту в цветах вашего заведения." },
  { icon: "printer", title: "Распечатайте QR", text: "Повесьте QR-код у кассы. Клиент сканирует его камерой телефона и получает карту без установки приложения." },
  { icon: "check", title: "Кассир подтверждает начисление", text: "Клиент показывает свой QR, сотрудник сканирует его и подтверждает визит. Только после этого штамп попадает на карту." },
];

const FEATURES: { icon: IconName; title: string; text: string }[] = [
  { icon: "phone", title: "Без приложения", text: "Карта открывается в браузере телефона. Клиенту не нужно ничего скачивать." },
  { icon: "shield", title: "Подтверждение сотрудником", text: "Начисление возможно только после подтверждения кассиром. Это защита от накруток." },
  { icon: "qr", title: "Одноразовый QR клиента", text: "Код обновляется после каждого использования, поэтому скриншот не пригодится." },
  { icon: "users", title: "Свои клиенты и награды", text: "Штампы или баллы, награды и свой цвет карты. Настройки вы меняете сами." },
  { icon: "chart", title: "Аналитика визитов", text: "Видно, кто возвращается и как часто. Расширенная аналитика доступна на платных тарифах." },
  { icon: "bolt", title: "Быстрый старт", text: "Запуск начинается с бесплатного тарифа, без обязательной оплаты." },
];

export default async function HomePage({ params }: { params: Promise<{ country: string }> }) {
  const c = parseCountry((await params).country);
  if (!c) notFound();
  const b = `/${c}`;
  const cta = registerHref(c);
  return (
    <>
      <JsonLd data={orgJsonLd()} />
      <section className="relative overflow-hidden">
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px] bg-[radial-gradient(60%_60%_at_70%_0%,rgba(57,255,136,0.10),transparent)]" />
        <div className="container-x grid items-center gap-12 py-14 sm:py-20 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <p className="badge mb-5">{countryName(c)} · бонусные карты по QR</p>
            <h1 className="text-4xl font-extrabold leading-[1.08] tracking-tight text-text sm:text-6xl">
              Бонусная карта <span className="glow-text">в телефоне клиента</span>, без приложения
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted">
              Клиент сканирует QR у кассы, копит штампы и возвращается за наградой. Каждое начисление подтверждает ваш сотрудник, поэтому накрутить бонусы нельзя.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href={cta} className="btn-primary !px-6 !py-3.5 text-base">Создать карту бесплатно</Link>
              <Link href={`${b}/demo`} className="btn-ghost !px-6 !py-3.5 text-base">Посмотреть демо</Link>
            </div>
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted">
              {["Бесплатный тариф", "Клиенту не нужно приложение", "Для малого бизнеса"].map((t) => (
                <li key={t} className="flex items-center gap-2"><Icon name="check" size={16} className="text-neon" />{t}</li>
              ))}
            </ul>
          </div>
          <Phone />
        </div>
      </section>

      <Section id="kak-eto-rabotaet" eyebrow="Как это работает" title="Три шага до первой карты" tone="alt">
        <ol className="grid gap-4 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="card relative">
              <span className="absolute right-5 top-4 text-5xl font-extrabold text-line" aria-hidden="true">{i + 1}</span>
              <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-neon/40 bg-neon/10 text-neon"><Icon name={s.icon} /></span>
              <h3 className="mt-4 text-lg font-bold text-text"><span className="sr-only">Шаг {i + 1}: </span>{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{s.text}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section id="vozmozhnosti" eyebrow="Возможности" title="Всё нужное для программы лояльности" intro="Без сложных внедрений: настройте карту сами и запускайте.">
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <li key={f.title} className="card">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-2 text-neon"><Icon name={f.icon} /></span>
              <h3 className="mt-4 font-semibold text-text">{f.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{f.text}</p>
            </li>
          ))}
        </ul>
        <p className="mt-6"><Link href={`${b}/vozmozhnosti`} className="text-sm font-semibold text-neon hover:underline">Все возможности →</Link></p>
      </Section>

      <Section id="otrasli" eyebrow="Решения" title="Для каких бизнесов" tone="alt">
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {INDUSTRIES.map((i) => (
            <li key={i.key}>
              <Link href={`${b}/resheniya#${i.key}`} className="card flex h-full flex-col gap-3 !p-4 transition hover:border-neon/60">
                <span className="text-neon"><Icon name={i.icon} size={26} /></span>
                <span className="font-semibold text-text">{i.name}</span>
                <span className="text-xs text-muted">{i.example}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="tarify" eyebrow="Тарифы" title="Начните бесплатно, растите по мере необходимости">
        <PricingCards country={c} />
        <p className="mt-5 text-sm text-muted">
          <Link href={`${b}/tarify`} className="font-semibold text-neon hover:underline">Сравнить тарифы и способы оплаты →</Link>
        </p>
      </Section>

      <Section
        id="zashchita"
        eyebrow="Защита от накруток"
        title="Бонус начисляется только с подтверждения сотрудника"
        intro="Мы не обещаем невозможного, но два простых механизма заметно снижают риск злоупотреблений."
        tone="alt"
      >
        <div className="grid items-center gap-8 lg:grid-cols-2">
          <ul className="space-y-4">
            <li className="card flex gap-4"><Icon name="shield" className="mt-0.5 shrink-0 text-neon" /><div><h3 className="font-semibold text-text">Подтверждение сотрудником</h3><p className="mt-1 text-sm text-muted">Штамп появляется на карте только после того, как кассир сканирует QR клиента и подтверждает начисление. Самому клиенту «начислить» себе нечего.</p></div></li>
            <li className="card flex gap-4"><Icon name="lock" className="mt-0.5 shrink-0 text-neon" /><div><h3 className="font-semibold text-text">Одноразовый QR клиента</h3><p className="mt-1 text-sm text-muted">После использования код обновляется. Скриншот или пересланная картинка не сработают второй раз.</p></div></li>
          </ul>
          <div className="mx-auto w-full max-w-sm">
            <CardMockup name="Барбершоп «Борода»" accent="#4cc9f0" total={6} filled={4} icon="scissors" reward="5-я стрижка со скидкой" />
            <p className="mt-3 text-center text-xs text-muted">Демонстрационная карта</p>
          </div>
        </div>
      </Section>

      <Section id="faq" eyebrow="FAQ" title="Частые вопросы">
        <div className="max-w-3xl"><Faq items={generalFaq(c).slice(0, 6)} /></div>
        <p className="mt-5 text-sm"><Link href={`${b}/faq`} className="font-semibold text-neon hover:underline">Все вопросы и ответы →</Link></p>
      </Section>

      <section className="pb-16 pt-4 sm:pb-24">
        <div className="container-x">
          <div className="relative overflow-hidden rounded-3xl border border-neon/30 bg-surface p-8 text-center sm:p-14">
            <div aria-hidden="true" className="absolute inset-0 -z-0 bg-[radial-gradient(50%_80%_at_50%_0%,rgba(57,255,136,0.14),transparent)]" />
            <h2 className="relative text-2xl font-extrabold text-text sm:text-4xl">Запустите бонусную карту сегодня</h2>
            <p className="relative mx-auto mt-3 max-w-xl text-muted">Создайте программу за несколько минут. Бесплатный тариф, оплата не нужна.</p>
            <div className="relative mt-7"><Link href={cta} className="btn-primary !px-7 !py-3.5 text-base">Создать карту бесплатно</Link></div>
          </div>
        </div>
      </section>
    </>
  );
}
