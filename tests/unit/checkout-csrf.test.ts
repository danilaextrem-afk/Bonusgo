import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth/session", () => ({
  assertSameOrigin: vi.fn(),
  verifyCsrf: vi.fn(async (csrf: string | null | undefined) => csrf === "valid-session-token"),
}));
vi.mock("@/server/tenancy", () => ({
  requireMembership: vi.fn(async () => ({ user: { id: "user-1", email: "owner@example.test" }, membership: { role: "OWNER" } })),
}));
vi.mock("@/server/payments/service", () => ({
  refreshPlategaPayment: vi.fn(async () => "refresh-checked"),
  createPaymentOrder: vi.fn(async () => ({ redirectUrl: "https://checkout.example.test/session" })),
}));

import { POST } from "@/app/api/payments/checkout/route";
import { POST as refresh } from "@/app/api/payments/platega/refresh/route";
import { assertSameOrigin, verifyCsrf } from "@/server/auth/session";
import { createPaymentOrder, refreshPlategaPayment } from "@/server/payments/service";
import { requireMembership } from "@/server/tenancy";
import { ForbiddenError } from "@/server/errors";

function checkoutForm(csrf?: string, overrides: Record<string, string> = {}): Request {
  const fields = new URLSearchParams({ companyId: "company-1", plan: "PRO", months: "1", ...overrides });
  if (csrf !== undefined) fields.set("csrf", csrf);
  return new Request("https://qronus.test/api/payments/checkout", {
    method: "POST",
    headers: { host: "qronus.test", origin: "https://qronus.test", "content-type": "application/x-www-form-urlencoded" },
    body: fields,
  });
}

beforeEach(() => vi.clearAllMocks());

describe("subscription checkout CSRF enforcement", () => {
  it("rejects missing CSRF with 403, before authorization or order creation", async () => {
    const response = await POST(checkoutForm());
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: "FORBIDDEN" });
    expect(verifyCsrf).toHaveBeenCalledWith(null);
    expect(requireMembership).not.toHaveBeenCalled();
    expect(createPaymentOrder).not.toHaveBeenCalled();
  });

  it("rejects incorrect CSRF and does not create a payment", async () => {
    const response = await POST(checkoutForm("forged"));
    expect(response.status).toBe(403);
    expect(verifyCsrf).toHaveBeenCalledWith("forged");
    expect(createPaymentOrder).not.toHaveBeenCalled();
  });

  it("accepts session token, authorizes OWNER, and redirects to checkout", async () => {
    const request = checkoutForm("valid-session-token", { plan: "TOP", months: "3", checkoutKey: "33333333-3333-4333-8333-333333333333" });
    const response = await POST(request);
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://checkout.example.test/session");
    expect(assertSameOrigin).toHaveBeenCalledWith(request);
    expect(verifyCsrf).toHaveBeenCalledWith("valid-session-token");
    expect(requireMembership).toHaveBeenCalledWith("company-1", ["OWNER"]);
    expect(createPaymentOrder).toHaveBeenCalledWith("company-1", "TOP", 3, { id: "user-1", email: "owner@example.test" }, "33333333-3333-4333-8333-333333333333");
  });

  it("rejects cross-origin requests before checking CSRF", async () => {
    vi.mocked(assertSameOrigin).mockImplementationOnce(() => { throw new ForbiddenError("Cross-origin"); });
    const response = await POST(checkoutForm("valid-session-token"));
    expect(response.status).toBe(403);
    expect(verifyCsrf).not.toHaveBeenCalled();
    expect(createPaymentOrder).not.toHaveBeenCalled();
  });

  it("rejects non-owner access even with a correct CSRF", async () => {
    vi.mocked(requireMembership).mockRejectedValueOnce(new ForbiddenError("Owner only"));
    const response = await POST(checkoutForm("valid-session-token"));
    expect(response.status).toBe(403);
    expect(createPaymentOrder).not.toHaveBeenCalled();
  });

  it("rejects invalid plan duration without creating an order", async () => {
    const response = await POST(checkoutForm("valid-session-token", { months: "2" }));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toContain("/app/billing?status=error");
    expect(createPaymentOrder).not.toHaveBeenCalled();
  });
});

describe("manual Platega refresh", () => {
  const companyId = "A".repeat(22);
  const paymentId = "B".repeat(22);

  it("authorizes an owner before passing internal IDs to reconciliation", async () => {
    const response = await refresh(checkoutForm("valid-session-token", { companyId, paymentId }));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toContain("status=refresh-checked");
    expect(requireMembership).toHaveBeenCalledWith(companyId, ["OWNER"]);
    expect(refreshPlategaPayment).toHaveBeenCalledExactlyOnceWith(companyId, paymentId);
  });

  it("rejects invalid CSRF and members without the owner role", async () => {
    const ids = { companyId, paymentId };
    expect((await refresh(checkoutForm("forged", ids))).status).toBe(403);
    expect(requireMembership).not.toHaveBeenCalled();
    vi.mocked(requireMembership).mockRejectedValueOnce(new ForbiddenError());
    expect((await refresh(checkoutForm("valid-session-token", ids))).status).toBe(403);
    expect(refreshPlategaPayment).not.toHaveBeenCalled();
  });
});
