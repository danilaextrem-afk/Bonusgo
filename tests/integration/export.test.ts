import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("next/headers", async () => (await import("./helpers")).nextHeadersMock);
vi.mock("next/navigation", async () => (await import("./helpers")).nextNavigationMock);

import { eq } from "drizzle-orm";
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

  it("exports monthly and daily UTC batches without overlap at calendar boundaries", async () => {
    const setup = await makeSetup({ plan: "TOP" });
    const users = await Promise.all([makeUser(), makeUser(), makeUser()]);
    const cards = await Promise.all(users.map((user) => joinProgram(user.id, setup.program.id)));
    const timestamps = [
      "2024-02-28T23:59:59.999Z",
      "2024-02-29T23:59:59.999Z",
      "2024-03-01T00:00:00.000Z",
    ];
    for (let i = 0; i < cards.length; i++) {
      await db.update(schema.cards).set({ createdAt: new Date(timestamps[i]) })
        .where(eq(schema.cards.id, cards[i].id));
    }
    const inserted = await db.insert(schema.transactions).values(cards.map((card, i) => ({
      companyId: setup.company.id,
      cardId: card.id,
      type: "ACCRUE" as const,
      amount: i + 1,
      idempotencyKey: `period-export-${i}`,
      createdAt: new Date(timestamps[i]),
    }))).returning({ id: schema.transactions.id });

    const febCards = await exportCompanyCsv(setup.company.id, "2024-02");
    const marCards = await exportCompanyCsv(setup.company.id, "2024-03");
    expect(febCards).toContain(cards[0].id);
    expect(febCards).toContain(cards[1].id);
    expect(febCards).not.toContain(cards[2].id);
    expect(marCards).toContain(cards[2].id);
    expect(marCards).not.toContain(cards[1].id);

    const leapDay = await exportCompanyTransactionsCsv(setup.company.id, "2024-02-29");
    const febTx = await exportCompanyTransactionsCsv(setup.company.id, "2024-02");
    const marTx = await exportCompanyTransactionsCsv(setup.company.id, "2024-03");
    expect(leapDay).toContain(inserted[1].id);
    expect(leapDay).not.toContain(inserted[0].id);
    expect(leapDay).not.toContain(inserted[2].id);
    expect(febTx).toContain(inserted[0].id);
    expect(febTx).toContain(inserted[1].id);
    expect(febTx).not.toContain(inserted[2].id);
    expect(marTx).toContain(inserted[2].id);
    expect(marTx).not.toContain(inserted[1].id);

    await createSession(setup.owner.id);
    const url = `http://localhost:3000/api/app/export?companyId=${setup.company.id}&kind=transactions&period=2024-02`;
    const response = await downloadCsv(new Request(url));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toContain("qronus-transactions-2024-02.csv");
    const csv = await response.text();
    expect(csv).toContain(inserted[0].id);
    expect(csv).not.toContain(inserted[2].id);

    for (const period of ["2023-02-29", "2024-02-30", "2024-13", "../../etc"]) {
      const invalid = await downloadCsv(new Request(url.replace("2024-02", encodeURIComponent(period))));
      expect(invalid.status).toBe(400);
      expect((await invalid.json()).error).toBe("VALIDATION");
    }
  });

  it("requires an eligible plan for transaction exports", async () => {
    const free = await makeSetup();
    await expect(exportCompanyTransactionsCsv(free.company.id))
      .rejects.toMatchObject({ code: "PLAN_LIMIT", status: 402 });
  });

  it("refuses to export another company's card or transaction history", async () => {
    const ownerA = await makeSetup({ plan: "TOP" });
    const ownerB = await makeSetup({ plan: "TOP" });
    await createSession(ownerA.owner.id);
    for (const kind of ["cards", "transactions"]) {
      const url = `http://localhost:3000/api/app/export?companyId=${ownerB.company.id}&kind=${kind}`;
      const response = await downloadCsv(new Request(url));
      expect(response.status).toBe(403);
      expect(response.headers.get("content-type")).toContain("application/json");
      const body = await response.json();
      expect(body.error).toBe("FORBIDDEN");
    }
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
