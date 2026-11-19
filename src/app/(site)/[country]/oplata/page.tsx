import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/site/PageHeader";
import { Section } from "@/components/site/Section";
import { parseCountry } from "@/components/site/site-data";
import { buildMetadata } from "@/lib/seo";

const title = "Оплата и получение доступа";
const path = "/oplata";

export async function generateMetadata({ params }: { params: Promise<{ country: string }> }): Promise<Metadata> {
  const country = parseCountry((await params).country);
  if (!country) return {};
  return buildMetadata({
    country, path, title,
    description: "Как оплатить тариф QRonus, проверить доступ и обратиться за возвратом.",
  });
}

export default async function Page({ params }: { params: Promise<{ country: string }> }) {
  const country = parseCountry((await params).country);
  if (!country) notFound();
  const base = `/${country}`;
  const link = "text-neon underline underline-offset-4";
  // The current merchant configuration applies to the RUB checkout.
  const operator = country === "ru" ? process.env.OWNER_NAME?.trim() : undefined;
  const taxId = country === "ru" ? process.env.OWNER_TAX_ID?.trim() : undefined;
  const address = country === "ru" ? process.env.OWNER_ADDRESS?.trim() : undefined;

  return (
    <>
      <PageHeader crumbs={[{ name: "Главная", href: base }, { name: title }]} h1={title} lead="Тариф QRonus предоставляет доступ к инструментам программы лояльности в кабинете бизнеса." />
      <Section className="!pt-2">
        <div className="grid max-w-4xl gap-4 md:grid-cols-2">
          <section className="card space-y-3">
            <h2 className="font-semibold">Как оплатить</h2>
            <p className="text-sm text-muted">
              Выберите <Link href={`${base}/tarify`} className={link}>тариф</Link> и срок в кабинете владельца. Итоговая сумма отображается перед оформлением. В кабинете доступны способы оплаты, подключённые для региона компании.
            </p>
            <Link href="/app/billing" className={link}>Перейти к тарифу и оплате</Link>
          </section>
          <section className="card space-y-3">
            <h2 className="font-semibold">Когда появится доступ</h2>
            <p className="text-sm text-muted">
              При онлайн-оплате тариф активируется после подтверждения провайдером. Статус платежа, тариф и срок его действия можно проверить в разделе «Тариф и оплата».
            </p>
          </section>
          <section className="card space-y-3">
            <h2 className="font-semibold">Как запросить возврат</h2>
            <p className="text-sm text-muted">
              Обратитесь в <Link href={`${base}/kontakty`} className={link}>поддержку</Link> и укажите аккаунт, дату и сумму платежа. Условия возврата описаны в <Link href={`${base}/usloviya`} className={link}>договорных документах</Link>.
            </p>
          </section>
          <section className="card space-y-3">
            <h2 className="font-semibold">Исполнитель</h2>
            {operator && taxId && address ? (
              <dl className="space-y-1 text-sm text-muted">
                <div><dt className="sr-only">Имя или наименование</dt><dd>{operator}</dd></div>
                <div><dt className="inline">ИНН </dt><dd className="inline">{taxId}</dd></div>
                <div><dt className="sr-only">Адрес</dt><dd>{address}</dd></div>
              </dl>
            ) : <p className="text-sm text-muted">Реквизиты для этого региона пока не опубликованы.</p>}
            <Link href={`${base}/kontakty`} className={link}>Контакты QRonus</Link>
          </section>
        </div>
      </Section>
    </>
  );
}
