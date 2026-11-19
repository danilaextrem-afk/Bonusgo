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
