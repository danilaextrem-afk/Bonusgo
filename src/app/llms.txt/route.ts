import { seoPages } from "@/content/seo";
import { PLAN_LIMITS, PLAN_PRICES, formatMoney } from "@/lib/plans";
import { SITE_URL } from "@/lib/seo";

export const dynamic = "force-static";

/** /llms.txt — a plain summary for AI assistants and AI search (llmstxt.org format). */
export function GET() {
  const link = (path: string, title: string) => `- [${title}](${SITE_URL}${path})`;
  const landings = seoPages.filter((p) => p.kind === "landing");
  const articles = seoPages.filter((p) => p.kind === "article");
  const lines = [
    "# QRonus",
    "",
    "> QRonus — сервис цифровых бонусных карт и программ лояльности по QR-коду для малого бизнеса в России и Беларуси: кофейни, кафе, барбершопы, салоны красоты, автомойки, магазины. Клиенту не нужно приложение — карта открывается в браузере телефона. Штамп или баллы начисляются только после того, как сотрудник отсканирует одноразовый QR клиента, поэтому накрутка невозможна.",
    "",
    "## Тарифы",
    `- FREE — бесплатно: 1 заведение, до ${PLAN_LIMITS.FREE.activeCustomers} активных клиентов, штампы, QR-плакат.`,
    `- PRO — ${formatMoney(PLAN_PRICES.RU.PRO, "RUB")}/мес в России, ${formatMoney(PLAN_PRICES.BY.PRO, "BYN")}/мес в Беларуси: до ${PLAN_LIMITS.PRO.activeCustomers} клиентов, баллы и штампы, награды, история, аналитика.`,
    `- TOP — ${formatMoney(PLAN_PRICES.RU.TOP, "RUB")}/мес в России, ${formatMoney(PLAN_PRICES.BY.TOP, "BYN")}/мес в Беларуси: до ${PLAN_LIMITS.TOP.activeCustomers} клиентов, филиалы, сотрудники, экспорт, без брендинга.`,
    "",
    "## Основные страницы",
    link("/ru", "Главная (Россия)"),
    link("/by", "Главная (Беларусь)"),
    link("/ru/tarify", "Тарифы и способы оплаты"),
    link("/ru/vozmozhnosti", "Возможности"),
    link("/ru/demo", "Демо цифровой карты"),
    link("/ru/faq", "Частые вопросы"),
    link("/ru/instrumenty", "Бесплатные калькуляторы и генератор QR для бизнеса"),
    "",
    "## Решения по отраслям",
    ...landings.map((p) => link(`/${p.countries.includes("ru") ? "ru" : "by"}/${p.slug}`, p.h1)),
    "",
    "## База знаний",
    ...articles.map((p) => link(`/${p.countries.includes("ru") ? "ru" : "by"}/baza-znaniy/${p.slug}`, p.h1)),
    "",
  ];
  return new Response(lines.join("\n"), { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
