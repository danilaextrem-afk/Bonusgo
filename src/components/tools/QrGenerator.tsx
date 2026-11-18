"use client";
import { useEffect, useMemo, useState } from "react";

const MAX_LEN = 500;

function normalize(raw: string, mode: "url" | "text"): { value?: string; error?: string } {
  const t = raw.trim();
  if (!t) return {};
  if (t.length > MAX_LEN) return { error: `Слишком длинно: максимум ${MAX_LEN} символов.` };
  if (mode === "text") return { value: t };
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(t) ? t : `https://${t}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== "http:" && u.protocol !== "https:") return { error: "Допускаются только ссылки http:// и https://." };
    if (!u.hostname.includes(".") && u.hostname !== "localhost") return { error: "Похоже, в адресе нет домена. Пример: example.com" };
    return { value: u.toString() };
  } catch {
    return { error: "Не удаётся разобрать ссылку. Пример: https://example.com/card" };
  }
}

function download(href: string, name: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function QrGenerator() {
  const [mode, setMode] = useState<"url" | "text">("url");
  const [text, setText] = useState("");
  const [venue, setVenue] = useState("");
  const [png, setPng] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const parsed = useMemo(() => normalize(text, mode), [text, mode]);
  const value = parsed.value;

  useEffect(() => {
    let alive = true;
    if (!value) {
      const t = setTimeout(() => alive && setPng(null), 0);
      return () => {
        alive = false;
        clearTimeout(t);
      };
    }
    (async () => {
      try {
        const mod = await import("qrcode");
        const QR = (mod as unknown as { default?: typeof mod }).default ?? mod;
        const url = await QR.toDataURL(value, { width: 1024, margin: 2, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#ffffff" } });
        if (alive) setPng(url);
      } catch {
        if (alive) setErr("Не удалось создать QR-код.");
      }
    })();
    return () => {
      alive = false;
    };
  }, [value]);

  const makePdf = async () => {
    if (!png) return;
    setBusy(true);
    setErr(null);
    try {
      const { PDFDocument, rgb } = await import("pdf-lib");
      const fontkit = (await import("@pdf-lib/fontkit")).default;
      const doc = await PDFDocument.create();
      doc.registerFontkit(fontkit);
      const [regBytes, boldBytes] = await Promise.all([
        fetch("/fonts/DejaVuSans.ttf").then((r) => r.arrayBuffer()),
        fetch("/fonts/DejaVuSans-Bold.ttf").then((r) => r.arrayBuffer()),
      ]);
      const font = await doc.embedFont(regBytes, { subset: true });
      const bold = await doc.embedFont(boldBytes, { subset: true });
      const W = 419.53;
      const H = 595.28; // A5 portrait, pt
      const page = doc.addPage([W, H]);
      const ink = rgb(0.05, 0.06, 0.07);
      const green = rgb(0.1, 0.65, 0.35);
      page.drawRectangle({ x: 0, y: H - 14, width: W, height: 14, color: green });

      const center = (t: string, y: number, size: number, f: typeof font, color = ink) => {
        const w = f.widthOfTextAtSize(t, size);
        page.drawText(t, { x: (W - w) / 2, y, size, font: f, color });
      };
      const wrap = (t: string, size: number, f: typeof font, maxW: number): string[] => {
        const words = t.split(/\s+/).filter(Boolean);
        const lines: string[] = [];
        let cur = "";
        for (const w of words) {
          const trial = cur ? `${cur} ${w}` : w;
          if (f.widthOfTextAtSize(trial, size) <= maxW || !cur) cur = trial;
          else {
            lines.push(cur);
            cur = w;
          }
        }
        if (cur) lines.push(cur);
        return lines.slice(0, 3);
      };

      let y = H - 85;
      center("Копите бонусы", y, 15, font, green);
      y -= 38;
      const title = venue.trim().slice(0, 60);
      if (title) {
        for (const line of wrap(title, 28, bold, W - 70)) {
          center(line, y, 28, bold);
          y -= 34;
        }
      }
      const qrSize = 270;
      const img = await doc.embedPng(png);
      const qy = Math.min(y - 20 - qrSize, 210);
      page.drawImage(img, { x: (W - qrSize) / 2, y: Math.max(qy, 150), width: qrSize, height: qrSize });
      center("Наведите камеру телефона на QR-код", 118, 13, bold);
      center("и получите бонусную карту", 100, 13, font);
      page.drawLine({ start: { x: 60, y: 60 }, end: { x: W - 60, y: 60 }, thickness: 0.6, color: rgb(0.8, 0.82, 0.83) });
      center("QRonus — цифровые бонусные карты", 40, 9, font, rgb(0.4, 0.43, 0.45));

      const bytes = await doc.save();
      const blob = new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      download(url, "qronus-plakat-a5.pdf");
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch {
      setErr("Не удалось собрать PDF. Попробуйте убрать необычные символы из названия.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="card space-y-4">
        <div role="group" aria-label="Тип данных" className="inline-flex rounded-xl border border-line p-1 text-sm">
          {(["url", "text"] as const).map((m) => (
            <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)} className={`rounded-lg px-4 py-2 font-medium ${mode === m ? "bg-neon text-black" : "text-muted hover:text-text"}`}>
              {m === "url" ? "Ссылка" : "Текст"}
            </button>
          ))}
        </div>
        <div>
          <label className="label" htmlFor="qr-text">{mode === "url" ? "Адрес ссылки" : "Текст"}</label>
          {mode === "url" ? (
            <input id="qr-text" className="input" inputMode="url" autoComplete="off" placeholder="https://example.com/card" maxLength={MAX_LEN + 50} value={text} onChange={(e) => setText(e.target.value)} aria-invalid={!!parsed.error} aria-describedby="qr-err" />
          ) : (
            <textarea id="qr-text" className="input min-h-24" maxLength={MAX_LEN + 50} value={text} onChange={(e) => setText(e.target.value)} aria-invalid={!!parsed.error} aria-describedby="qr-err" />
          )}
          <p id="qr-err" role="alert" className="mt-1 min-h-4 text-xs text-danger">{parsed.error ?? ""}</p>
        </div>
        <div>
          <label className="label" htmlFor="qr-venue">Название точки для плаката</label>
          <input id="qr-venue" className="input" maxLength={60} placeholder="Кофейня на Садовой" value={venue} onChange={(e) => setVenue(e.target.value)} />
        </div>
        <p className="text-xs leading-relaxed text-muted">QR создаётся в вашем браузере, введённые данные никуда не отправляются.</p>
      </div>
      <div className="card flex flex-col items-center gap-4">
        <div className="flex aspect-square w-full max-w-[280px] items-center justify-center rounded-2xl bg-white p-3">
          {png && value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={png} alt="Сгенерированный QR-код" width={256} height={256} className="h-full w-full" />
          ) : (
            <p className="px-4 text-center text-sm text-[#4b545b]">Введите ссылку, и QR-код появится здесь</p>
          )}
        </div>
        <div className="flex w-full flex-wrap justify-center gap-3">
          <button type="button" className="btn-primary" disabled={!png || !value} onClick={() => png && download(png, "qronus-qr.png")}>Скачать PNG</button>
          <button type="button" className="btn-ghost" disabled={!png || !value || busy} onClick={makePdf}>{busy ? "Готовим PDF..." : "Плакат А5 (PDF)"}</button>
        </div>
        {err && <p role="alert" className="text-sm text-danger">{err}</p>}
      </div>
    </div>
  );
}
