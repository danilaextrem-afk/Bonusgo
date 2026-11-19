/**
 * Validate Render's private Deploy Hook without changing its Git ref.
 *
 * Render automatically disables Auto-Deploy when a deploy hook receives
 * ref=<SHA>. Omit ref to deploy the latest commit on the linked branch
 * and preserve the service's configured Auto-Deploy setting.
 *
 * The GitHub Actions workflow independently verifies that main has not
 * advanced and that its current SHA has passed CI.
 */
export function renderHookForLatest(rawHook) {
  if (typeof rawHook !== "string" || rawHook.length > 2048)
    throw new Error("Render deploy hook is not configured");
  let url;
  try { url = new URL(rawHook); }
  catch { throw new Error("Render deploy hook URL is invalid"); }

  if (url.origin !== "https://api.render.com" ||
      url.username || url.password || url.hash ||
      !/^\/deploy\/srv-[a-z0-9-]+\/?$/i.test(url.pathname))
    throw new Error("Render deploy hook has an untrusted origin or path");

  // Reject duplicates, ref and any other unexpected query parameters.
  const params = [...url.searchParams.keys()];
  if (params.length !== 1 || params[0] !== "key" ||
      url.searchParams.getAll("key").length !== 1 ||
      !url.searchParams.get("key"))
    throw new Error("Render deploy hook must contain exactly one secret key");

  return url;
}

/** HTTP 200 starts a deploy; HTTP 202 queues it. Neither proves publication. */
export async function requestRenderDeploy({ rawHook, fetcher = fetch }) {
  const url = renderHookForLatest(rawHook);
  let status;
  try {
    const response = await fetcher(url.toString(), {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(25_000),
    });
    status = response.status;
    await response.body?.cancel().catch(() => {});
  } catch {
    return { ok: false, code: "NETWORK_ERROR" };
  }
  if (status === 200) return { ok: true, code: "DEPLOY_STARTED" };
  if (status === 202) return { ok: true, code: "DEPLOY_QUEUED" };
  return { ok: false, code: "HTTP_" + status };
}
