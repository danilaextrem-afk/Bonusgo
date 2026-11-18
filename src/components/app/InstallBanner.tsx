"use client";
import { useEffect, useState } from "react";

const KEY = "bonusgo:install-dismissed";

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

function readDismissed(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

/** Dismissible "add to home screen" hint: native prompt on Android/Chrome, instructions on iOS Safari. */
export function InstallBanner() {
  const [mode, setMode] = useState<"none" | "prompt" | "ios">("none");
  const [evt, setEvt] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    if (readDismissed()) return;
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (standalone) return;
    const ua = navigator.userAgent;
    const isIos = /iPad|iPhone|iPod/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
    if (isIos) setMode("ios");
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvt(e as InstallPromptEvent);
      setMode("prompt");
    };
    const onInstalled = () => setMode("none");
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (mode === "none") return null;

  const dismiss = () => {
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* storage unavailable: just hide for this visit */
    }
    setMode("none");
  };
  const install = async () => {
    if (!evt) return;
    try {
      await evt.prompt();
      await evt.userChoice;
    } catch {
      /* ignore */
    }
    setEvt(null);
    setMode("none");
  };

  return (
    <div className="card mb-4 flex items-start gap-3" role="region" aria-label="Добавить на главный экран">
      <div className="min-w-0 flex-1">
        <div className="font-semibold">Добавить на главный экран</div>
        {mode === "ios" ? (
          <p className="mt-1 text-sm text-muted">Нажмите «Поделиться» в Safari, затем «На экран «Домой» — карты будут открываться как приложение.</p>
        ) : (
          <p className="mt-1 text-sm text-muted">Откройте бонусные карты одним нажатием, как приложение. Устанавливать ничего не нужно.</p>
        )}
        {mode === "prompt" && (
          <button type="button" onClick={install} className="btn-primary mt-3">
            Добавить
          </button>
        )}
      </div>
      <button type="button" onClick={dismiss} aria-label="Закрыть" className="shrink-0 px-2 text-xl leading-none text-muted">
        ×
      </button>
    </div>
  );
}
