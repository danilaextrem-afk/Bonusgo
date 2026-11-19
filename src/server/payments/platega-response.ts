/** Safely parses an untrusted payment provider response without exposing its body. */
export function parsePlategaCheckoutResponse(text: string): { transactionId?: string; redirect?: string } | null {
  try {
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    return {
      transactionId: typeof record.transactionId === "string" ? record.transactionId : undefined,
      redirect: typeof record.redirect === "string" ? record.redirect : undefined,
    };
  } catch {
    return null;
  }
}

/** Only accept the official HTTPS checkout origin; never forward users to arbitrary URLs. */
export function parsePlategaCheckoutUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "pay.platega.io" ||
        url.port !== "" || url.username !== "" || url.password !== "") return null;
    return url.href;
  } catch {
    return null;
  }
}
