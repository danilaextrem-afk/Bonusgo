import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { classifyVersion, probeRender, RENDER_VERSION_URL, MAX_RESPONSE_BYTES } from "../../scripts/lib/render-probe.mjs";

const SHA = "a".repeat(40);
const GOOD = JSON.stringify({ revision: "a".repeat(12) });

describe("Render deployment verifier", () => {
  it("matches an exact safe SHA and never uses arbitrary URLs", async () => {
    const urls = [];
    const result = await probeRender({ expectedSha: SHA, attempts: 1, fetcher: async (url) => {
      urls.push(url);
      return new Response(GOOD, { status: 200 });
    } });
    assert.deepEqual(urls, [RENDER_VERSION_URL]);
    assert.deepEqual(result, { ok: true, code: "MATCH", revision: SHA.slice(0, 12), attempts: 1 });
  });

  it("classifies a provider outage without guessing a deployment", () => {
    assert.deepEqual(classifyVersion(503, "", SHA), { ok: false, code: "HTTP_503" });
    assert.deepEqual(classifyVersion(502, "", SHA), { ok: false, code: "HTTP_502" });
  });

  it("retries transient 503 then verifies the same SHA", async () => {
    let calls = 0, sleeps = 0;
    const result = await probeRender({ expectedSha: SHA, attempts: 3, delayMs: 0,
      fetcher: async () => ++calls < 3 ? new Response("", { status: 503 }) : new Response(GOOD, { status: 200 }),
      sleep: async () => { sleeps++; },
    });
    assert.equal(result.ok, true);
    assert.equal(result.attempts, 3);
    assert.equal(sleeps, 2);
  });

  it("fails closed after persistent 503 instead of inventing a match", async () => {
    const result = await probeRender({ expectedSha: SHA, attempts: 2, delayMs: 0,
      fetcher: async () => new Response("", { status: 503 }), sleep: async () => {} });
    assert.deepEqual(result, { ok: false, code: "HTTP_503", attempts: 2 });
  });

  it("rejects invalid JSON, body shape, missing SHA and mismatched deployments", () => {
    assert.equal(classifyVersion(200, "<html>Error</html>", SHA).code, "INVALID_JSON");
    assert.equal(classifyVersion(200, '{"revision":null}', SHA).code, "INVALID_REVISION");
    assert.equal(classifyVersion(200, JSON.stringify({revision: "b".repeat(12)}), SHA).code, "MISMATCH");
    assert.equal(classifyVersion(200, GOOD, "not-a-SHA").code, "INVALID_EXPECTED_SHA");
    assert.equal(classifyVersion(200, JSON.stringify({revision: "a".repeat(12), secret: true}), SHA).code, "INVALID_REVISION");
  });

  it("stops reading oversized responses without echoing them", async () => {
    const result = await probeRender({ expectedSha: SHA, attempts: 1,
      fetcher: async () => new Response("x".repeat(MAX_RESPONSE_BYTES + 1), {status:200})});
    assert.equal(result.code, "INVALID_RESPONSE");
  });

  it("does not retry definitive stale SHA or invalid content", async () => {
    let calls = 0;
    const result = await probeRender({ expectedSha: SHA, attempts: 4,
      fetcher: async () => { calls++; return new Response(JSON.stringify({ revision: "b".repeat(12) }), { status: 200 }); },
      sleep: async () => { throw Error("Must not sleep"); },
    });
    assert.equal(result.code, "MISMATCH");
    assert.equal(calls, 1);
  });
});
