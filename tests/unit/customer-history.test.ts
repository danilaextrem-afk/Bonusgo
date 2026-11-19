import { describe, expect, it } from "vitest";
import {
  encodeCustomerHistoryCursor, parseCustomerHistoryCursor,
  CUSTOMER_HISTORY_PAGE_SIZE,
} from "@/server/loyalty/customer-history";

const good = {
  at: "2026-11-19T12:13:14.123456Z",
  id: "abcdefghijklmnopqrstuv",
};

describe("customer history cursor", () => {
  it("round trips the exact microsecond timestamp and 22-character transaction ID", () => {
    const encoded = encodeCustomerHistoryCursor(good);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(parseCustomerHistoryCursor(encoded)).toEqual(good);
    expect(CUSTOMER_HISTORY_PAGE_SIZE).toBe(20);
  });

  it("treats absent pagination cursor as the first page", () => {
    expect(parseCustomerHistoryCursor(undefined)).toBeNull();
    expect(parseCustomerHistoryCursor("")).toBeNull();
  });

  it.each([
    "not-base64&", "a".repeat(200), "YQ",
    Buffer.from("2026-11-19T12:13:14.123Z|abcdefghijklmnopqrstuv").toString("base64url"),
    Buffer.from("2026-02-30T12:13:14.123456Z|abcdefghijklmnopqrstuv").toString("base64url"),
    Buffer.from("2026-11-19T12:13:14.123456Z|bad-id").toString("base64url"),
    Buffer.from("2026-11-19T12:13:14.123456Z|abcdefghijklmnopqrstuv|extra").toString("base64url"),
    Buffer.from("2026-11-19T12:13:14.123456Z|abcdefghijklmnopqrstuv").toString("base64url") + "=",
  ])("fails closed for untrusted cursors", (cursor) => {
    expect(() => parseCustomerHistoryCursor(cursor))
      .toThrowError(expect.objectContaining({ code: "VALIDATION", status: 400 }));
  });
});
