"use client";
import { useRef, useState } from "react";

const MAX_BYTES = 200 * 1024;

async function resizeToDataUrl(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  let side = 256;
  for (let attempt = 0; attempt < 4; attempt++) {
    const scale = Math.min(1, side / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas");
    ctx.drawImage(bmp, 0, 0, w, h);
    for (const [type, q] of [["image/png", undefined], ["image/webp", 0.85], ["image/webp", 0.6], ["image/jpeg", 0.6]] as const) {
      const url = canvas.toDataURL(type, q);
      if (url.startsWith(`data:${type}`) && url.length <= MAX_BYTES) return url;
    }
    side = Math.round(side * 0.7);
  }
  throw new Error("too-big");
}

export function ImageUpload({ name, initial, disabled }: { name: string; initial?: string | null; disabled?: boolean }) {
  const [value, setValue] = useState(initial ?? "");
  const [err, setErr] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div>
      <input type="hidden" name={name} value={value} />
      <div className="flex items-center gap-3">
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="Логотип" className="h-16 w-16 rounded-xl border border-line object-cover" />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-xl border border-dashed border-line text-xs text-muted">нет</div>
        )}
        <div className="flex flex-col gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={disabled}
            className="text-xs text-muted file:mr-3 file:rounded-lg file:border file:border-line file:bg-surface-2 file:min-h-10 file:px-3 file:py-2 file:text-text"
            aria-label="Загрузить логотип"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              setErr("");
              try {
                setValue(await resizeToDataUrl(f));
              } catch {
                setErr("Не удалось обработать изображение. Попробуйте другой файл.");
              }
            }}
          />
          {value && !disabled && (
            <button type="button" className="text-left text-xs text-muted underline" onClick={() => { setValue(""); if (inputRef.current) inputRef.current.value = ""; }}>
              Убрать логотип
            </button>
          )}
        </div>
      </div>
      {err && <p className="mt-2 text-xs text-danger">{err}</p>}
    </div>
  );
}
