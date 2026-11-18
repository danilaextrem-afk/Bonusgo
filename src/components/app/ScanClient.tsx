"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

export interface ScanProgram {
  id: string;
  name: string;
  type: "STAMPS" | "POINTS";
  venueName: string;
  stampsRequired: number;
  pointsPercent: number;
  rewardText: string;
  rewards: { id: string; title: string; cost: number }[];
}

interface Detector {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>;
}
type DetectorCtor = new (opts: { formats: string[] }) => Detector;

type Result =
  | { kind: "ok"; action: "accrue" | "redeem"; balance: number; duplicated: boolean; type: "STAMPS" | "POINTS"; stampsRequired: number }
  | { kind: "error"; message: string; upsell?: boolean };

function newKey(): string {
  const c = globalThis.crypto;
  if (typeof c.randomUUID === "function") return c.randomUUID();
  const a = new Uint8Array(16);
  c.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function ScanClient({ companyId, programs }: { companyId: string; programs: ScanProgram[] }) {
  const [programId, setProgramId] = useState(programs[0]?.id ?? "");
  const [code, setCode] = useState("");
  const [amount, setAmount] = useState("");
  const [stamps, setStamps] = useState(1);
  const [rewardId, setRewardId] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [camSupported, setCamSupported] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [camError, setCamError] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const keyRef = useRef<{ sig: string; key: string } | null>(null);

  const program = programs.find((p) => p.id === programId);

  useEffect(() => {
    setCamSupported("BarcodeDetector" in window && !!navigator.mediaDevices?.getUserMedia);
  }, []);

  const stopCamera = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setScanning(false);
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  async function startCamera() {
    setCamError("");
    try {
      const Ctor = (window as unknown as { BarcodeDetector: DetectorCtor }).BarcodeDetector;
      const detector = new Ctor({ formats: ["qr_code"] });
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return stopCamera();
      video.srcObject = stream;
      await video.play();
      setScanning(true);
      timerRef.current = setInterval(async () => {
        try {
          const found = await detector.detect(video);
          const hit = found.find((c) => c.rawValue.startsWith("BG1."));
          if (hit) {
            setCode(hit.rawValue);
            setResult(null);
            stopCamera();
            if (navigator.vibrate) navigator.vibrate(60);
          }
        } catch {
          /* frame not ready */
        }
      }, 250);
    } catch {
      stopCamera();
      setCamError("Нет доступа к камере. Разрешите её в настройках браузера или введите код вручную.");
    }
  }

  async function submit(action: "accrue" | "redeem") {
    if (!program || busy) return;
    const trimmed = code.trim();
    if (trimmed.length < 8) return setResult({ kind: "error", message: "Сначала отсканируйте QR клиента или введите код." });
    const payload: Record<string, unknown> = { companyId, action, programId: program.id, customerToken: trimmed };
    if (action === "accrue") {
      if (program.type === "POINTS") {
        const n = Number(amount.replace(",", "."));
        if (!Number.isFinite(n) || n <= 0) return setResult({ kind: "error", message: "Введите сумму покупки." });
        payload.purchaseMinor = Math.round(n * 100);
      } else payload.stamps = stamps;
    } else if (rewardId) payload.rewardId = rewardId;

    // The idempotency key stays the same while the same operation is retried.
    const sig = JSON.stringify(payload);
    if (!keyRef.current || keyRef.current.sig !== sig) keyRef.current = { sig, key: newKey() };

    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/app/operations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, idempotencyKey: keyRef.current.key }),
      });
      const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (res.ok && data?.ok) {
        keyRef.current = null;
        setResult({ kind: "ok", action, balance: Number(data.balance), duplicated: !!data.duplicated, type: data.type as "STAMPS" | "POINTS", stampsRequired: Number(data.stampsRequired) });
        setCode("");
        setAmount("");
      } else {
        setResult({ kind: "error", message: typeof data?.message === "string" ? data.message : "Не удалось выполнить операцию.", upsell: data?.error === "PLAN_LIMIT" });
      }
    } catch {
      setResult({ kind: "error", message: "Нет связи. Нажмите кнопку ещё раз: повторная отправка безопасна, бонусы не задвоятся." });
    } finally {
      setBusy(false);
    }
  }

  if (programs.length === 0) {
    return (
      <div className="card text-sm text-muted">
        Нет активных программ. <Link href="/app/programs" className="text-neon underline underline-offset-4">Создайте программу</Link>.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-4">
      {programs.length > 1 && (
        <div>
          <label className="label" htmlFor="scan-program">Программа</label>
          <select id="scan-program" className="input h-14 text-base" value={programId} onChange={(e) => { setProgramId(e.target.value); setRewardId(""); }}>
            {programs.map((p) => <option key={p.id} value={p.id}>{p.venueName} — {p.name}</option>)}
          </select>
        </div>
      )}

      <div className="card space-y-3">
        <div className={`${scanning ? "" : "hidden"} overflow-hidden rounded-xl bg-black`}>
          <video ref={videoRef} playsInline muted className="aspect-square w-full object-cover" />
        </div>
        {camSupported && (
          scanning ? (
            <button type="button" className="btn-ghost w-full" onClick={stopCamera}>Остановить камеру</button>
          ) : (
            <button type="button" className="btn-primary h-14 w-full text-base" onClick={startCamera}>Сканировать QR клиента</button>
          )
        )}
        {!camSupported && <p className="text-xs text-muted">Камера в этом браузере не поддерживает сканирование. Введите код вручную из QR клиента.</p>}
        {camError && <p role="alert" className="text-sm text-danger">{camError}</p>}
        <div>
          <label className="label" htmlFor="scan-code">Код клиента</label>
          <input id="scan-code" className="input h-14 font-mono text-base" value={code} onChange={(e) => setCode(e.target.value)} placeholder="BG1.…" autoComplete="off" autoCapitalize="off" spellCheck={false} />
        </div>
      </div>

      {program?.type === "POINTS" && (
        <div>
          <label className="label" htmlFor="scan-amount">Сумма покупки</label>
          <input id="scan-amount" className="input h-14 text-xl" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
          <p className="mt-1 text-xs text-muted">Начислим {program.pointsPercent}% баллами</p>
        </div>
      )}
      {program?.type === "STAMPS" && (
        <div className="flex items-center justify-between rounded-xl border border-line bg-surface px-4 py-3">
          <span className="text-sm">Штампов за визит</span>
          <div className="flex items-center gap-3">
            <button type="button" aria-label="Меньше" className="btn-ghost !px-4 !py-2 text-lg" onClick={() => setStamps((s) => Math.max(1, s - 1))}>−</button>
            <span className="w-6 text-center text-xl font-bold" aria-live="polite">{stamps}</span>
            <button type="button" aria-label="Больше" className="btn-ghost !px-4 !py-2 text-lg" onClick={() => setStamps((s) => Math.min(10, s + 1))}>+</button>
          </div>
        </div>
      )}
      {program && program.rewards.length > 0 && (
        <div>
          <label className="label" htmlFor="scan-reward">Награда для списания</label>
          <select id="scan-reward" className="input h-14" value={rewardId} onChange={(e) => setRewardId(e.target.value)}>
            <option value="">{program.type === "STAMPS" ? `По умолчанию: ${program.rewardText}` : "Выберите награду"}</option>
            {program.rewards.map((r) => <option key={r.id} value={r.id}>{r.title} — {r.cost}</option>)}
          </select>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <button type="button" disabled={busy} className="btn-primary h-16 text-base" onClick={() => submit("accrue")}>{busy ? "…" : "Начислить"}</button>
        <button type="button" disabled={busy} className="btn-ghost h-16 text-base" onClick={() => submit("redeem")}>{busy ? "…" : "Списать награду"}</button>
      </div>

      <div aria-live="polite">
        {result?.kind === "ok" && (
          <div className="card border-neon/50 bg-neon/10 text-center">
            <div className="text-lg font-bold text-neon">{result.action === "accrue" ? "Начислено" : "Награда списана"}</div>
            <div className="mt-1 text-sm">
              Баланс карты: <b>{result.balance}</b>{result.type === "STAMPS" ? ` из ${result.stampsRequired}` : " баллов"}
            </div>
            {result.duplicated && <div className="mt-2 text-xs text-warn">Эта операция уже была выполнена ранее — повторно не начисляем.</div>}
          </div>
        )}
        {result?.kind === "error" && (
          <div role="alert" className="card border-danger/50 bg-danger/10 text-sm text-danger">
            {result.message}
            {result.upsell && <Link href="/app/billing" className="mt-2 block font-semibold text-neon underline underline-offset-4">Посмотреть тарифы</Link>}
          </div>
        )}
      </div>
    </div>
  );
}
