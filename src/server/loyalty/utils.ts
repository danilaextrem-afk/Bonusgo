// Pure helpers (no DB) — unit tested.
const TRANSLIT: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
  с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya", і: "i", ў: "u",
};

export function slugify(input: string): string {
  const s = input
    .normalize("NFKC")
    .toLowerCase()
    .split("")
    .map((ch) => (ch in TRANSLIT ? TRANSLIT[ch] : ch))
    .join("")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return s || "venue";
}

export const MAX_PURCHASE_MINOR = 10_000_000;

/** Points for a purchase: floor(purchaseMinor * percent / 10000) (minor units → whole points). */
export function computePoints(purchaseMinor: number, pointsPercent: number): number {
  if (!Number.isInteger(purchaseMinor) || purchaseMinor < 1 || purchaseMinor > MAX_PURCHASE_MINOR) throw new RangeError("purchaseMinor out of range");
  if (!Number.isInteger(pointsPercent) || pointsPercent < 1 || pointsPercent > 50) throw new RangeError("pointsPercent out of range");
  return Math.floor((purchaseMinor * pointsPercent) / 10000);
}

/** CSV cell with quoting and formula-injection neutralization (= + - @ \t \r). */
export function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? "" : v instanceof Date ? v.toISOString() : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (/[",\n\r;]/.test(s) || s.startsWith("'")) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

export function csvRow(cells: unknown[]): string {
  return cells.map(csvCell).join(",");
}

export function maskEmail(email: string | null | undefined): string {
  if (!email) return "";
  if (email.endsWith("@deleted.invalid")) return "удалён";
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  const head = local.slice(0, Math.min(2, Math.max(1, local.length - 1)));
  return `${head}***@${domain}`;
}

/** Accepts "BG1.<token>" or bare token; returns the bare token or null if malformed. */
export function parseCustomerToken(raw: string): string | null {
  const t = String(raw ?? "").trim();
  const bare = t.startsWith("BG1.") ? t.slice(4) : t;
  return /^[A-Za-z0-9_-]{16,128}$/.test(bare) ? bare : null;
}

const HEX = /^#[0-9a-fA-F]{6}$/;
export function isValidColor(c: string): boolean {
  return HEX.test(c);
}

export const MAX_LOGO_BYTES = 200 * 1024;
export function isValidLogoUrl(u: string): boolean {
  if (u.length > 300_000) return false;
  const m = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(u);
  if (m) return Math.floor((m[2].length * 3) / 4) <= MAX_LOGO_BYTES;
  if (u.length > 2000) return false;
  try {
    const url = new URL(u);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}
