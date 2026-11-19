import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderHookForLatest, requestRenderDeploy } from "../../scripts/lib/render-deploy-hook.mjs";

const HOOK = "https://api.render.com/deploy/srv-test123?key=private-test-only";

describe("Render manual deploy hook safety and Auto-Deploy preservation", () => {
  it("accepts official Render hook without a ref query parameter", () => {
    const url = renderHookForLatest(HOOK);
    assert.equal(url.origin, "https://api.render.com");
    assert.equal(url.pathname, "/deploy/srv-test123");
    assert.equal(url.searchParams.get("key"), "private-test-only");
    assert.deepEqual([...url.searchParams.keys()], ["key"]);
    assert.equal(url.searchParams.has("ref"), false);
  });

  for (const candidate of [
    "http://api.render.com/deploy/srv-test?key=secret",
    "https://api.render.com.evil.example/deploy/srv-test?key=secret",
    "https://evil.example/deploy/srv-test?key=secret",
    "https://api.render.com/other/srv-test?key=secret",
    "https://api.render.com/deploy/srv-test?key=secret&other=123",
    "https://api.render.com/deploy/srv-test?key=secret&ref=" + "a".repeat(40),
    "https://api.render.com/deploy/srv-test?key=secret&key=other",
    "https://user:pass@api.render.com/deploy/srv-test?key=secret",
    "https://api.render.com/deploy/srv-test?key=secret#fragment",
    "https://api.render.com/deploy/srv-test",
    "https://api.render.com/deploy/srv-test?key=",
  ]) {
    it("rejects malformed/untrusted deploy hook", () => {
      assert.throws(() => renderHookForLatest(candidate));
    });
  }

  it("submits one POST to Render without disabling Auto-Deploy via ref", async () => {
    const calls = [];
    const result = await requestRenderDeploy({
      rawHook: HOOK,
      fetcher: async (url, options) => {
        calls.push({ url, options });
        return new Response(JSON.stringify({ id: "dep-test" }), { status: 200 });
      },
    });
    assert.deepEqual(result, { ok: true, code: "DEPLOY_STARTED" });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].options.method, "POST");
    assert.equal(calls[0].options.redirect, "error");
    const url = new URL(calls[0].url);
    assert.equal(url.searchParams.get("key"), "private-test-only");
    assert.equal(url.searchParams.has("ref"), false);
  });

  it("treats 202 as queued rather than deployed", async () => {
    const result = await requestRenderDeploy({
      rawHook: HOOK, fetcher: async () => new Response("", { status: 202 }),
    });
    assert.deepEqual(result, { ok: true, code: "DEPLOY_QUEUED" });
  });

  it("fails closed on HTTP errors and network failures", async () => {
    const missing = await requestRenderDeploy({
      rawHook: HOOK, fetcher: async () => new Response("provider body", { status: 404 }),
    });
    assert.deepEqual(missing, { ok: false, code: "HTTP_404" });
    const offline = await requestRenderDeploy({
      rawHook: HOOK, fetcher: async () => { throw new Error("private error details"); },
    });
    assert.deepEqual(offline, { ok: false, code: "NETWORK_ERROR" });
  });
});
