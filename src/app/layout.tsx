import type { Metadata, Viewport } from "next";
import "./globals.css";

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: { default: "BONUSGO — цифровые бонусные карты для бизнеса", template: "%s — BONUSGO" },
  description: "Электронные бонусные карты и программы лояльности для кофеен, барбершопов, салонов и автомоек в России и Беларуси. Без приложения, через QR-код.",
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION || undefined,
    yandex: process.env.YANDEX_VERIFICATION || undefined,
  },
};

export const viewport: Viewport = { themeColor: "#0b0d0e", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
