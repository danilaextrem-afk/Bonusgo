import { describe, expect, it } from "vitest";
import { parsePlategaCheckoutResponse, parsePlategaCheckoutUrl } from "@/server/payments/platega-response";

describe("Platega checkout response parsing", () => {
  it("accepts only string checkout fields", () => {
    expect(parsePlategaCheckoutResponse('{"transactionId":"tx-1","redirect":"https://pay.platega.io/checkout"}'))
      .toEqual({ transactionId: "tx-1", redirect: "https://pay.platega.io/checkout" });
  });

  it.each(["", "not-json", "null", "[]", "42", '"string"', "true", "{"])(
    "rejects malformed or non-object provider body %s",
    (body) => expect(parsePlategaCheckoutResponse(body)).toBeNull(),
  );

  it("does not trust unexpected types or copy additional provider fields", () => {
    expect(parsePlategaCheckoutResponse('{"transactionId":123,"redirect":{"url":"bad"},"secret":"never-copy"}'))
      .toEqual({ transactionId: undefined, redirect: undefined });
  });

  it("rejects a top-level array even when it contains an object", () => {
    expect(parsePlategaCheckoutResponse('[{"transactionId":"tx"}]')).toBeNull();
  });
});

describe("Platega checkout redirect allowlist", () => {
  it("accepts the official HTTPS checkout URL", () => {
    expect(parsePlategaCheckoutUrl("https://pay.platega.io/checkout?transaction=abc"))
      .toBe("https://pay.platega.io/checkout?transaction=abc");
  });

  it.each([
    "http://pay.platega.io/checkout",
    "https://pay.platega.io.evil.example/",
    "https://evil.example/",
    "https://user:pass@pay.platega.io/",
    "https://pay.platega.io:8443/",
    "javascript:alert(1)",
    "//pay.platega.io/checkout",
    "not-a-url",
  ])("rejects untrusted redirect %s", (url) => {
    expect(parsePlategaCheckoutUrl(url)).toBeNull();
  });
});
