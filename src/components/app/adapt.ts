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
export function series(x: unknown): { label: string; value: number }[] {
  return asArray(x).map((p) => {
    if (Array.isArray(p)) return { label: String(p[0]).slice(5, 10), value: Number(p[1]) || 0 };
    return { label: pStr(p, "date", "day", "label").slice(5, 10) || pStr(p, "date", "day", "label"), value: pNum(p, "count", "value", "n", "total") };
  });
}
