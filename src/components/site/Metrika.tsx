"use client";
import { useEffect } from "react";
import { CONSENT_EVENT, readConsent } from "./consent";

declare global {
  interface Window {
    ym?: ((...args: unknown[]) => void) & { a?: unknown[] };
  }
}

/** Yandex Metrika, loaded only when an ID is configured AND the visitor accepted cookies. */
export function Metrika({ id }: { id?: string }) {
  useEffect(() => {
    if (!id || !/^\d{4,12}$/.test(id)) return;
    let loaded = false;
    const load = () => {
      if (loaded || readConsent() !== "accepted") return;
      loaded = true;
      const counter = Number(id);
      const ym: NonNullable<Window["ym"]> = function (...args: unknown[]) {
        (ym.a = ym.a || []).push(args);
      };
      window.ym = window.ym ?? ym;
      const s = document.createElement("script");
      s.async = true;
      s.src = "https://mc.yandex.ru/metrika/tag.js";
      s.onload = () => window.ym?.(counter, "init", { clickmap: true, trackLinks: true, accurateTrackBounce: true });
      document.head.appendChild(s);
    };
    load();
    window.addEventListener(CONSENT_EVENT, load);
    return () => window.removeEventListener(CONSENT_EVENT, load);
  }, [id]);
  return null;
}
