"use client";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import type { QrData } from "./qr";
import { QrSvg } from "./QrSvg";

type Payload = { qr: QrData; expiresAt: number };
type Refresh = () => Promise<Payload | { error: string }>;

const REFRESH_EVERY_MS = 4 * 60 * 1000;

export function MyQr({ initial, refresh }: { initial: Payload; refresh: Refresh }) {
  const [data, setData] = useState<Payload>(initial);
  const [now, setNow] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const lastRef = useRef(Date.now());

  const doRefresh = useCallback(() => {
    startTransition(async () => {
      try {
        const r = await refresh();
        if ("error" in r) setError(r.error);
        else {
          setData(r);
          setError("");
          lastRef.current = Date.now();
        }
      } catch {
        setError("Не удалось обновить код. Проверьте интернет.");
      }
    });
  }, [refresh]);

  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (!document.hidden && n - lastRef.current >= REFRESH_EVERY_MS) {
        lastRef.current = n; // avoid duplicate triggers while the request is in flight
        doRefresh();
      }
    }, 1000);
    return () => clearInterval(t);
  }, [doRefresh]);

  const left = now === null ? null : Math.max(0, Math.round((data.expiresAt - now) / 1000));
  const mm = left === null ? "--" : String(Math.floor(left / 60)).padStart(2, "0");
  const ss = left === null ? "--" : String(left % 60).padStart(2, "0");
  const expired = left !== null && left <= 0;

  return (
    <div className="text-center">
      <div className={`mx-auto w-full max-w-xs rounded-2xl bg-white p-2 ${expired ? "opacity-30" : ""}`}>
        <QrSvg qr={data.qr} className="w-full" label="Ваш QR-код для начисления бонусов" />
      </div>
      <p className="mt-3 text-sm text-muted" aria-live="off">
        {expired ? "Код устарел" : <>Код действует ещё <span className="font-mono text-text">{mm}:{ss}</span></>}
      </p>
      {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
      <button type="button" className="btn-ghost mt-3" disabled={pending} onClick={doRefresh}>{pending ? "Обновляем…" : "Обновить код"}</button>
      <p className="mt-4 text-xs text-muted">Покажите этот код кассиру. Он одноразовый и обновляется автоматически.</p>
    </div>
  );
}
