import "server-only";
import sitemap from "@/app/sitemap";
import { SITE_URL } from "@/lib/seo";

/** Submits all sitemap URLs to IndexNow (Yandex shares submissions with other IndexNow engines). */
export async function submitSitemapToIndexNow(): Promise<{ ok: boolean; status?: number; submitted: number; error?: string }> {
  const key = process.env.INDEXNOW_KEY;
  if (!key) return { ok: false, submitted: 0, error: "not_configured" };
  const urlList = sitemap().map((e) => e.url).slice(0, 10000);
  const host = new URL(SITE_URL).host;
  try {
    const res = await fetch("https://yandex.com/indexnow", {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ host, key, keyLocation: `${SITE_URL}/${key}.txt`, urlList }),
      signal: AbortSignal.timeout(15_000),
    });
    return { ok: res.ok, status: res.status, submitted: urlList.length };
  } catch {
    return { ok: false, submitted: 0, error: "upstream_failed" };
  }
}
