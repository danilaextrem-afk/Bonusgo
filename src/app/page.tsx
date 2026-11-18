import Link from "next/link";
import type { Metadata } from "next";
import { Beacon } from "@/components/site/Beacon";
import { CookieBanner } from "@/components/site/CookieBanner";
import { Logo } from "@/components/site/Header";
import { JsonLd } from "@/components/site/JsonLd";
import { Phone } from "@/components/site/Phone";
import { Metrika } from "@/components/site/Metrika";
import { orgJsonLd } from "@/components/site/org-ld";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  country: null,
  path: "/",
  title: "QRonus — цифровые бонусные карты для бизнеса",
  description: "Бонусные карты по QR для кофеен, барбершопов, салонов и автомоек. Выберите страну: Россия или Беларусь.",
});

const COUNTRIES = [
  { path: "ru", name: "Россия", note: "Цены в рублях (RUB)", lang: "ru-RU" },
  { path: "by", name: "Беларусь", note: "Цены в белорусских рублях (BYN)", lang: "ru-BY" },
];

export default function RootPage() {
  return (
    <>
      <header className="container-x flex h-16 items-center">
        <Logo href="/" />
      </header>
      <main id="main" className="container-x grid items-center gap-12 py-10 sm:py-16 lg:grid-cols-[1.1fr_0.9fr]">
        <div>
          <h1 className="text-4xl font-extrabold leading-[1.08] tracking-tight text-text sm:text-6xl">
            Бонусная карта <span className="glow-text">по QR</span> для вашего бизнеса
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted">
            Клиент сканирует QR у кассы и копит штампы в телефоне, без приложения. Каждое начисление подтверждает сотрудник.
          </p>
          <h2 className="mt-9 text-sm font-semibold uppercase tracking-wider text-muted">Выберите страну</h2>
          <ul className="mt-3 grid max-w-xl gap-3 sm:grid-cols-2">
            {COUNTRIES.map((c) => (
              <li key={c.path}>
                <Link href={`/${c.path}`} hrefLang={c.lang} className="card block !p-5 transition hover:border-neon/60 hover:shadow-[0_0_30px_-10px_rgba(57,255,136,0.4)]">
                  <span className="text-xl font-bold text-text">{c.name}</span>
                  <span className="mt-1 block text-sm text-muted">{c.note}</span>
                  <span className="mt-3 block text-sm font-semibold text-neon">Перейти →</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <Phone />
      </main>
      <footer className="border-t border-line">
        <div className="container-x flex flex-wrap gap-x-6 gap-y-2 py-6 text-xs text-muted">
          <span>© {new Date().getFullYear()} QRonus</span>
          <Link href="/ru/politika-konfidencialnosti" className="hover:text-neon">Политика конфиденциальности</Link>
          <Link href="/ru/usloviya" className="hover:text-neon">Условия</Link>
          <Link href="/ru/cookies" className="hover:text-neon">Cookies</Link>
        </div>
      </footer>
      <JsonLd data={orgJsonLd()} />
      <CookieBanner country="ru" />
      <Metrika id={process.env.YANDEX_METRIKA_ID} />
      <Beacon />
    </>
  );
}
