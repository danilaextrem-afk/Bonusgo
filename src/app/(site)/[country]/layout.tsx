import { notFound } from "next/navigation";
import { Beacon } from "@/components/site/Beacon";
import { CookieBanner } from "@/components/site/CookieBanner";
import { Footer } from "@/components/site/Footer";
import { Header } from "@/components/site/Header";
import { Metrika } from "@/components/site/Metrika";
import { sharedContentPaths } from "@/components/site/content-loader";
import { STATIC_PAGES, parseCountry } from "@/components/site/site-data";
import { COUNTRY_PATHS } from "@/lib/seo";

export const dynamicParams = false;

export function generateStaticParams() {
  return COUNTRY_PATHS.map((country) => ({ country }));
}

export default async function CountryLayout({ children, params }: { children: React.ReactNode; params: Promise<{ country: string }> }) {
  const { country: raw } = await params;
  const country = parseCountry(raw);
  if (!country) notFound();
  const staticPaths = STATIC_PAGES.map((p) => p.path).filter(Boolean);
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-neon focus:px-4 focus:py-2 focus:text-black">
        К содержимому
      </a>
      <Header country={country} shared={sharedContentPaths()} staticPaths={staticPaths} />
      <main id="main">{children}</main>
      <Footer country={country} owner={process.env.OWNER_NAME || undefined} />
      <CookieBanner country={country} />
      <Metrika id={process.env.YANDEX_METRIKA_ID} />
      <Beacon />
    </>
  );
}
