/** Accept only same-site relative paths (blocks open redirects). */
export function safeNext(v: unknown, fallback: string): string {
  if (typeof v !== "string") return fallback;
  if (v.length > 300 || !v.startsWith("/") || v.startsWith("//") || v.includes("\\") || /[\u0000-\u001f\s]/.test(v)) return fallback;
  return v;
}

export function appUrl(): string {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

export function isDemoMode(): boolean {
  return process.env.DEMO_MODE !== "false";
}
