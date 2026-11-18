import "server-only";

/**
 * Transactional email via Resend's HTTP API (free tier). Configure RESEND_API_KEY and EMAIL_FROM
 * (e.g. "QRonus <no-reply@your-domain>"; the domain must be verified in Resend).
 */
export const emailConfigured = () => Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);

export async function sendEmail(to: string, subject: string, text: string): Promise<void> {
  if (!emailConfigured()) throw new Error("email_not_configured");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${process.env.RESEND_API_KEY}` },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [to], subject, text }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`email HTTP ${res.status}`);
}
