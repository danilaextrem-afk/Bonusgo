"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { CONSENT_KEY, readConsent, writeConsent } from "./consent";

export function CookieBanner({ country }: { country: string }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(readConsent() === null), 0);
    return () => clearTimeout(t);
  }, []);
  if (!visible) return null;
  const choose = (v: "accepted" | "declined") => {
    writeConsent(v);
    setVisible(false);
  };
  return (
    <div role="region" aria-label="Использование cookies" data-key={CONSENT_KEY} className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-xl rounded-2xl border border-line bg-surface-2 p-4 shadow-2xl sm:bottom-5">
      <p className="text-sm leading-relaxed text-text">
        Мы используем cookies для работы сайта и, с вашего согласия, для аналитики посещаемости.{" "}
        <Link href={`/${country}/cookies`} className="inline-flex min-h-10 items-center text-neon underline underline-offset-2">Подробнее</Link>
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="btn-primary !px-4 !py-2 min-h-11" onClick={() => choose("accepted")}>Принять</button>
        <button type="button" className="btn-ghost !px-4 !py-2 min-h-11" onClick={() => choose("declined")}>Отклонить</button>
      </div>
    </div>
  );
}
