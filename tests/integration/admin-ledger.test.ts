import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("next/headers", async () => (await import("./helpers")).nextHeadersMock);
vi.mock("next/navigation", async () => (await import("./helpers")).nextNavigationMock);
import { eq } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { createSession } from "@/server/auth/session";
import { runAdminLedgerAudit } from "@/server/loyalty/admin-ledger";
import { makeCompany, makeSetup, makeUser, resetDb } from "./helpers";

beforeEach(resetDb);

describe("admin ledger diagnostics", () => {
  it("fails closed when unauthenticated or signed in as a business owner", async () => {
    const owner = await makeUser();
    const company = await makeCompany(owner.id);
    await expect(runAdminLedgerAudit(company.id)).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });

    await createSession(owner.id);
    await expect(runAdminLedgerAudit(company.id)).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    expect(await db.select().from(schema.auditLogs)).toHaveLength(0);
  });

  it("requires database ADMIN role and rejects invalid or unknown companies", async () => {
    const admin = await makeUser({ platformRole: "ADMIN" });
    await createSession(admin.id);
    await expect(runAdminLedgerAudit("../cross-company")).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(runAdminLedgerAudit("abcdefghijklmnopqrstuv")).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
  });

  it("shows only a read-only summary to admins and audits a mismatch", async () => {
    const admin = await makeUser({ platformRole: "ADMIN" });
    const setup = await makeSetup();
    await createSession(admin.id);
    const blank = await runAdminLedgerAudit(setup.company.id);
    expect(blank).toMatchObject({ companyId: setup.company.id, cardsChecked: 0, discrepancies: [] });

    const customer = await makeUser();
    const [card] = await db.insert(schema.cards).values({
      companyId: setup.company.id, programId: setup.program.id, customerId: customer.id, balance: 7,
    }).returning();
    const report = await runAdminLedgerAudit(setup.company.id);
    expect(report.discrepancies).toEqual([{
      cardId: card.id, storedBalance: 7, ledgerBalance: 0, foreignTenantTransactions: 0,
    }]);
    const [unchanged] = await db.select().from(schema.cards).where(eq(schema.cards.id, card.id));
    expect(unchanged.balance).toBe(7);
    const logs = await db.select().from(schema.auditLogs);
    expect(logs.map((row) => row.action)).toContain("loyalty.ledger.mismatch");
    expect(logs.every((row) => !JSON.stringify(row.meta).includes(card.id))).toBe(true);
  });

  it("limits expensive scans to five per admin per minute", async () => {
    const admin = await makeUser({ platformRole: "ADMIN" });
    const company = await makeCompany(admin.id);
    await createSession(admin.id);
    for (let i = 0; i < 5; i++)
      expect((await runAdminLedgerAudit(company.id)).cardsChecked).toBe(0);
    await expect(runAdminLedgerAudit(company.id)).rejects.toMatchObject({ code: "RATE_LIMITED", status: 429 });
    expect((await db.select().from(schema.auditLogs)).length).toBe(5);
  });
});
