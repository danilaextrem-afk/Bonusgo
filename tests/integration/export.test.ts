import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("next/headers", async () => (await import("./helpers")).nextHeadersMock);
vi.mock("next/navigation", async () => (await import("./helpers")).nextNavigationMock);

import { db, schema } from "@/server/db";
import { createSession } from "@/server/auth/session";
import { GET as downloadCsv } from "@/app/api/app/export/route";
import { exportCompanyCsv, exportCompanyTransactionsCsv, joinProgram } from "@/server/loyalty/service";
import { makeSetup, makeUser, resetDb } from "./helpers";

beforeEach(resetDb);

describe("complete company CSV exports", () => {
  it("exports signed loyalty transactions with safe CSV quoting and tenant isolation", async () => {
    const own = await makeSetup({ plan: "TOP" });
    const other = await makeSetup({ plan: "TOP" });
    const customer = await makeUser();
    const customerOther = await makeUser();
    const card = await joinProgram(customer.id, own.program.id);
    const otherCard = await joinProgram(customerOther.id, other.program.id);

    const added = await db.insert(schema.transactions).values([
      {
        companyId: own.company.id, cardId: card.id, type: "ACCRUE",
        amount: 5, purchaseMinor: 1_000, idempotencyKey: "csv-accrue-01",
        staffUserId: own.owner.id, note: '=HYPERLINK("https://fake.example")',
      },
      {
        companyId: own.company.id, cardId: card.id, type: "REDEEM",
        amount: -3, idempotencyKey: "csv-redeem-01",
        staffUserId: own.owner.id, note: "Награда",
      },
      {
        companyId: other.company.id, cardId: otherCard.id, type: "ACCRUE",
        amount: 99, idempotencyKey: "csv-other-01",
      },
    ]).returning({ id: schema.transactions.id });

    const csv = await exportCompanyTransactionsCsv(own.company.id);
    expect(csv.startsWith("\uFEFFtransaction_id,card_id,type,amount,purchase_minor,staff_user_id,note,created_at\r\n")).toBe(true);
    expect(csv.match(/\uFEFF/g)).toHaveLength(1);
    expect(csv.trimEnd().split("\r\n")).toHaveLength(3);
    expect(csv).toContain(added[0].id);
    expect(csv).toContain(added[1].id);
    expect(csv).not.toContain(added[2].id);
    expect(csv).not.toContain(otherCard.id);
    expect(csv).toContain('"' + "'=HYPERLINK(" + '""https://fake.example""' + ')' + '"');
    expect(csv).toContain("REDEEM,-3");
    expect(csv).not.toContain(customer.email);

    const cards = await exportCompanyCsv(own.company.id);
    expect(cards.match(/\uFEFF/g)).toHaveLength(1);
    expect(cards).toContain(card.id);
    expect(cards).not.toContain(otherCard.id);
  });

  it("requires an eligible plan for transaction exports", async () => {
    const free = await makeSetup();
    await expect(exportCompanyTransactionsCsv(free.company.id))
      .rejects.toMatchObject({ code: "PLAN_LIMIT", status: 402 });
  });

  it("downloads either CSV with exactly one UTF-8 BOM; rejects invalid kinds", async () => {
    const setup = await makeSetup({ plan: "TOP" });
    await createSession(setup.owner.id);
    const base = `http://localhost:3000/api/app/export?companyId=${setup.company.id}`;

    for (const kind of ["cards", "transactions"]) {
      const response = await downloadCsv(new Request(base + "&kind=" + kind));
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/csv");
      expect(response.headers.get("content-disposition")).toContain("qronus-" + kind);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      // Fetch Response.text() strips a UTF-8 BOM; assert the actual download bytes.
      const bytes = new Uint8Array(await response.arrayBuffer());
      expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
      expect(Array.from(bytes.slice(3, 6))).not.toEqual([0xef, 0xbb, 0xbf]);
    }
    const invalid = await downloadCsv(new Request(base + "&kind=private"));
    expect(invalid.status).toBe(400);
    expect((await invalid.json()).error).toBe("VALIDATION");
  });
});
