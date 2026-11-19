/**
 * Read-only Render deployment probe.
 * Do not print response bodies: provider HTML may contain diagnostic details.
 * The single allowed URL is hardcoded to avoid arbitrary network destinations.
 */
export const RENDER_VERSION_URL = "https://qronus.onrender.com/api/version";
export const MAX_RESPONSE_BYTES = 4096;

export function classifyVersion(status, body, expectedSha) {
  if (status !== 200) return { ok: false, code: `HTTP_${status}` };
  if (typeof expectedSha !== "string" || !/^[a-f\d]{40}$/i.test(expectedSha))
    return { ok: false, code: "INVALID_EXPECTED_SHA" };
  if (typeof body !== "string" || Buffer.byteLength(body) > MAX_RESPONSE_BYTES)
    return { ok: false, code: "INVALID_RESPONSE" };
  let data;
  try { data = JSON.parse(body); }
  catch { return { ok: false, code: "INVALID_JSON" }; }
  if (!data || typeof data !== "object" || Array.isArray(data) ||
      Object.keys(data).length !== 1 ||
      typeof data.revision !== "string" ||
      !/^[a-f\d]{12}$/.test(data.revision))
    return { ok: false, code: "INVALID_REVISION" };

  const expected = expectedSha.slice(0, 12).toLowerCase();
  return data.revision === expected
    ? { ok: true, code: "MATCH", revision: data.revision }
    : { ok: false, code: "MISMATCH", expected, found: data.revision };
}

async function readBounded(response) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const parts = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) return null;
      parts.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return Buffer.concat(parts.map((x) => Buffer.from(x))).toString("utf8");
}

/** One result is always returned; network errors never count as deployment success. */
export async function probeRender({
  expectedSha,
  fetcher = fetch,
  attempts = 6,
  delayMs = 10000,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
  if (typeof expectedSha !== "string" || !/^[a-f\d]{40}$/i.test(expectedSha))
    return { ok: false, code: "INVALID_EXPECTED_SHA", attempts: 0 };
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 10)
    throw new RangeError("Invalid retry count");

  let result = { ok: false, code: "NOT_CHECKED" };
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetcher(RENDER_VERSION_URL, {
        method: "GET",
        redirect: "error",
        headers: { Accept: "application/json", "Cache-Control": "no-cache" },
        signal: AbortSignal.timeout(20000),
      });
      const body = response.status === 200 ? await readBounded(response) : "";
      result = classifyVersion(response.status, body, expectedSha);
    } catch {
      result = { ok: false, code: "NETWORK_ERROR" };
    }
    if (result.ok) return { ...result, attempts: attempt };
    // A stale deployment will not become the right SHA simply because we
    // retry: reserve retries for transient network/Render cold-start failures.
    if (!["HTTP_502", "HTTP_503", "HTTP_504", "NETWORK_ERROR"].includes(result.code))
      return { ...result, attempts: attempt };
    if (attempt < attempts) await sleep(delayMs);
  }
  return { ...result, attempts };
}
