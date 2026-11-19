import { describe, expect, it } from "vitest";
import { parsePlategaCheckoutResponse } from "@/server/payments/platega-response";

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
