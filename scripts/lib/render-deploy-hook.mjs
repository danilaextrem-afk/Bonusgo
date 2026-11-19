/**
 * Validate a Render Deploy Hook and pin it to a specific reviewed Git SHA.
 * Deploy hook credentials stay in GitHub Actions secrets, never in logs.
 */
export function renderHookForCommit(rawHook, sha) {
  if (typeof sha !== "string" || !/^[a-f0-9]{40}$/i.test(sha))
    throw new Error("Invalid Git commit SHA");
  if (typeof rawHook !== "string" || rawHook.length > 2048)
    throw new Error("Render deploy hook is not configured");
  let url;
  try { url = new URL(rawHook); }
  catch { throw new Error("Render deploy hook URL is invalid"); }
  if (url.origin !== "https://api.render.com" ||
      url.username || url.password || url.hash ||
      !/^\/deploy\/srv-[a-z0-9-]+\/?$/i.test(url.pathname))
    throw new Error("Render deploy hook has an untrusted origin or path");
  const keys = [...url.searchParams.keys()];
  if (keys.length !== 1 || keys[0] !== "key" ||
      !url.searchParams.get("key"))
    throw new Error("Render deploy hook must contain exactly one secret key");
  url.searchParams.set("ref", sha.toLowerCase());
  return url;
}

/** HTTP 200 starts a deploy; HTTP 202 queues it. Neither proves publication. */
export async function requestRenderDeploy({ rawHook, sha, fetcher = fetch }) {
  const url = renderHookForCommit(rawHook, sha);
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
