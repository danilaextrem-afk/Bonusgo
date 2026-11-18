import Link from "next/link";
import { TOOLS, countryName, otherCountry, type CP } from "./site-data";
import { Logo } from "./Header";

export function Footer({ country, owner }: { country: CP; owner?: string }) {
  const b = `/${country}`;
  const other = otherCountry(country);
  const col = "space-y-2 text-sm";
  const link = "text-muted hover:text-neon";
  return (
    <footer className="mt-10 border-t border-line bg-surface/40">
      <div className="container-x grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-5">
        <div className="lg:col-span-1">
          <Logo href={b} />
          <p className="mt-3 text-sm leading-relaxed text-muted">Цифровые бонусные карты по QR для малого бизнеса в России и Беларуси.</p>
          <p className="mt-4 text-xs text-muted">
            Регион: <strong className="text-text">{countryName(country)}</strong> ·{" "}
            <Link href={`/${other}`} hrefLang={other === "ru" ? "ru-RU" : "ru-BY"} className="text-neon hover:underline">{countryName(other)}</Link>
          </p>
        </div>
        <nav aria-label="Продукт">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-text">Продукт</p>
          <ul className={col}>
            <li><Link className={link} href={`${b}/vozmozhnosti`}>Возможности</Link></li>
            <li><Link className={link} href={`${b}/tarify`}>Тарифы</Link></li>
            <li><Link className={link} href={`${b}/demo`}>Демо карты</Link></li>
            <li><Link className={link} href={`${b}/resheniya`}>Решения по отраслям</Link></li>
            <li><Link className={link} href={`${b}/faq`}>Вопросы и ответы</Link></li>
          </ul>
        </nav>
        <nav aria-label="Бесплатные инструменты">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-text">Инструменты</p>
          <ul className={col}>
            {TOOLS.map((t) => (
              <li key={t.key}><Link className={link} href={`${b}/instrumenty/${t.key}`}>{t.title}</Link></li>
            ))}
          </ul>
        </nav>
        <nav aria-label="Компания">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-text">Компания</p>
          <ul className={col}>
            <li><Link className={link} href={`${b}/baza-znaniy`}>База знаний</Link></li>
            <li><Link className={link} href={`${b}/partneram`}>Партнёрам</Link></li>
            <li><Link className={link} href={`${b}/kontakty`}>Контакты</Link></li>
            <li><Link className={link} href="/login">Войти</Link></li>
          </ul>
        </nav>
        <nav aria-label="Документы">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-text">Документы</p>
          <ul className={col}>
            <li><Link className={link} href={`${b}/politika-konfidencialnosti`}>Политика конфиденциальности</Link></li>
            <li><Link className={link} href={`${b}/usloviya`}>Условия использования</Link></li>
            <li><Link className={link} href={`${b}/soglasie`}>Согласие на обработку данных</Link></li>
            <li><Link className={link} href={`${b}/cookies`}>Cookies</Link></li>
          </ul>
        </nav>
      </div>
      <div className="border-t border-line">
        <div className="container-x flex flex-col gap-1 py-5 text-xs text-muted sm:flex-row sm:justify-between">
          <p>© {new Date().getFullYear()} QRonus{owner ? ` · ${owner}` : ""}</p>
          <p>Демо-примеры на сайте носят иллюстративный характер.</p>
        </div>
      </div>
    </footer>
  );
}
