import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderHookForCommit, requestRenderDeploy } from "../../scripts/lib/render-deploy-hook.mjs";

const SHA = "a".repeat(40);
const HOOK = "https://api.render.com/deploy/srv-test123?key=private-test-only";

describe("manual Render deploy hook safety", () => {
  it("allows only Render hook and pins exact reviewed revision", () => {
    const url = renderHookForCommit(HOOK, SHA);
    assert.equal(url.host, "api.render.com");
    assert.equal(url.pathname, "/deploy/srv-test123");
    assert.equal(url.searchParams.get("ref"), SHA);
  });

  for (const candidate of [
    "http://api.render.com/deploy/srv-test?key=secret",
    "https://api.render.com.evil.example/deploy/srv-test?key=secret",
    "https://evil.example/deploy/srv-test?key=secret",
    "https://api.render.com/other/srv-test?key=secret",
    "https://api.render.com/deploy/srv-test?key=secret&other=123",
    "https://api.render.com/deploy/srv-test?key=secret&ref=abc",
    "https://user:pass@api.render.com/deploy/srv-test?key=secret",
    "https://api.render.com/deploy/srv-test?key=secret#fragment",
    "https://api.render.com/deploy/srv-test",
  ]) {
    it("rejects untrusted or malformed hook: " + new URL(candidate).hostname, () => {
      assert.throws(() => renderHookForCommit(candidate, SHA));
    });
  }

  it("rejects invalid branch names and short SHAs", () => {
    for (const sha of ["main", "a".repeat(12), "z".repeat(40)]) {
      assert.throws(() => renderHookForCommit(HOOK, sha), /Invalid Git commit SHA/);
    }
  });

  it("submits only a POST to Render with a pinned commit", async () => {
    const calls = [];
    const result = await requestRenderDeploy({
      rawHook: HOOK, sha: SHA, fetcher: async (url, options) => {
        calls.push({ url, options });
        return new Response(JSON.stringify({ id: "dep-test" }), { status: 200 });
      }
    });
    assert.deepEqual(result, { ok: true, code: "DEPLOY_STARTED" });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].options.method, "POST");
    assert.equal(calls[0].options.redirect, "error");
    const url = new URL(calls[0].url);
    assert.equal(url.searchParams.get("ref"), SHA);
  });

  it("separates 202 queued from completed deployment", async () => {
    const queued = await requestRenderDeploy({
      rawHook: HOOK, sha: SHA, fetcher: async () => new Response("", { status: 202 })
    });
    assert.deepEqual(queued, { ok: true, code: "DEPLOY_QUEUED" });
  });

  it("fails closed on HTTP 404 and network errors without reporting the secret", async () => {
    const missing = await requestRenderDeploy({
      rawHook: HOOK, sha: SHA, fetcher: async () => new Response("not found", { status: 404 })
    });
    assert.deepEqual(missing, { ok: false, code: "HTTP_404" });
    const offline = await requestRenderDeploy({
      rawHook: HOOK, sha: SHA, fetcher: async () => { throw new Error("leaked URL"); }
    });
    assert.deepEqual(offline, { ok: false, code: "NETWORK_ERROR" });
  });
});
