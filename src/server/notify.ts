import { audit } from "@/server/audit";

/** Sends a Telegram message to the platform owner. No-op when not configured; never throws. */
export async function notifyOwner(text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: text.slice(0, 4000), disable_web_page_preview: true }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`Telegram HTTP ${res.status}`);
  } catch (e) {
    // Never include the token: only the message text of the error.
    const message = (e instanceof Error ? e.message : String(e)).replace(token, "***").slice(0, 300);
    await audit("error.notify_failed", { meta: { message } });
  }
}
