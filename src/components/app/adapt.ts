/** Tolerant readers for service results (keeps UI resilient to small shape differences). */
export type Rec = Record<string, unknown>;

export function rec(x: unknown): Rec {
  return typeof x === "object" && x !== null ? (x as Rec) : {};
}
export function pick(o: unknown, ...keys: string[]): unknown {
  const r = rec(o);
  for (const k of keys) if (r[k] !== undefined && r[k] !== null) return r[k];
  return undefined;
}
export function pStr(o: unknown, ...keys: string[]): string {
  const v = pick(o, ...keys);
  return v === undefined ? "" : String(v);
}
export function pNum(o: unknown, ...keys: string[]): number {
  const v = Number(pick(o, ...keys));
  return Number.isFinite(v) ? v : 0;
}
export function asArray(x: unknown, ...keys: string[]): unknown[] {
  if (Array.isArray(x)) return x;
  const inner = pick(x, ...keys, "rows", "items", "data");
  return Array.isArray(inner) ? inner : [];
}
/** Series like [{date|day, count|value}] -> chart points. */
/** "2026-10-20" -> "20.10" (Russian day.month). */
function dayLabel(v: string): string {
  const m = /^\d{4}-(\d{2})-(\d{2})/.exec(v);
  return m ? `${m[2]}.${m[1]}` : v;
}
export function series(x: unknown): { label: string; value: number }[] {
  return asArray(x).map((p) => {
    if (Array.isArray(p)) return { label: dayLabel(String(p[0])), value: Number(p[1]) || 0 };
    return { label: dayLabel(pStr(p, "date", "day", "label")), value: pNum(p, "count", "value", "n", "total") };
  });
}
