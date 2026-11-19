import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("next/headers", async () => (await import("./helpers")).nextHeadersMock);
vi.mock("next/navigation", async () => (await import("./helpers")).nextNavigationMock);

import { eq } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { accrue, createReward, issueCustomerToken, redeem } from "@/server/loyalty/service";
import { makeSetup, makeUser, resetDb } from "./helpers";

beforeEach(resetDb);
let n = 0;
const key = () => `intent-retry-${++n}-${Date.now()}`;
const qr = async (userId: string) => `BG1.${(await issueCustomerToken(userId)).token}`;

describe("request intent is immutable for a loyalty idempotency key", () => {
  it("rejects a different stamp count, but permits an identical retry without another accrual", async () => {
    const setup = await makeSetup({ plan: "TOP" });
    const customer = await makeUser();
    const base = { actorUserId: setup.owner.id, companyId: setup.company.id, programId: setup.program.id, idempotencyKey: key() };
    const token = await qr(customer.id);
    const original = await accrue({ ...base, customerToken: token, stamps: 2 });

    await expect(accrue({ ...base, customerToken: token, stamps: 4 }))
      .rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT", status: 409 });

    const replay = await accrue({ ...base, customerToken: await qr(customer.id), stamps: 2 });
    expect(replay.duplicated).toBe(true);
    expect(replay.transaction.id).toBe(original.transaction.id);
    expect(replay.transaction.intentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(replay.card.balance).toBe(2);
    expect(await db.select().from(schema.transactions)).toHaveLength(1);
  });

  it("binds points accrual to exact purchase amount, even for same customer", async () => {
    const setup = await makeSetup({ type: "POINTS", plan: "PRO", pointsPercent: 10 });
    const customer = await makeUser();
    const base = { actorUserId: setup.owner.id, companyId: setup.company.id, programId: setup.program.id, idempotencyKey: key() };
    const token = await qr(customer.id);
    const original = await accrue({ ...base, customerToken: token, purchaseMinor: 250_00 });
    await expect(accrue({ ...base, customerToken: token, purchaseMinor: 350_00 }))
      .rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT", status: 409 });
    const replay = await accrue({ ...base, customerToken: token, purchaseMinor: 250_00 });
    expect(replay.duplicated).toBe(true);
    expect(replay.transaction.id).toBe(original.transaction.id);
    expect(replay.card.balance).toBe(25);
    expect(await db.select().from(schema.transactions)).toHaveLength(1);
  });

  it("rejects changed reward ID even when rewards have identical names and prices", async () => {
    const setup = await makeSetup({ type: "POINTS", plan: "PRO", pointsPercent: 10 });
    const customer = await makeUser();
    const base = { actorUserId: setup.owner.id, companyId: setup.company.id, programId: setup.program.id };
    const firstReward = await createReward(setup.company.id, { programId: setup.program.id, title: "Кофе", cost: 5 });
    const secondReward = await createReward(setup.company.id, { programId: setup.program.id, title: "Кофе", cost: 5 });
    await accrue({ ...base, customerToken: await qr(customer.id), purchaseMinor: 200_00, idempotencyKey: key() });
    const redeemKey = key();
    const token = await qr(customer.id);
    const original = await redeem({ ...base, customerToken: token, rewardId: firstReward.id, idempotencyKey: redeemKey });

    await expect(redeem({ ...base, customerToken: token, rewardId: secondReward.id, idempotencyKey: redeemKey }))
      .rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT", status: 409 });
    const replay = await redeem({ ...base, customerToken: token, rewardId: firstReward.id, idempotencyKey: redeemKey });
    expect(replay.duplicated).toBe(true);
    expect(replay.transaction.id).toBe(original.transaction.id);
    expect(replay.card.balance).toBe(15);
    expect(await db.select().from(schema.transactions)).toHaveLength(2);
  });

  it("fails closed for legacy transactions without intent hash; balances remain unchanged", async () => {
    const setup = await makeSetup();
    const customer = await makeUser();
    const base = { actorUserId: setup.owner.id, companyId: setup.company.id, programId: setup.program.id, idempotencyKey: key() };
    const token = await qr(customer.id);
    const original = await accrue({ ...base, customerToken: token, stamps: 1 });
    await db.update(schema.transactions).set({ intentHash: null }).where(eq(schema.transactions.id, original.transaction.id));
    await expect(accrue({ ...base, customerToken: token, stamps: 1 }))
      .rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT", status: 409 });
    const [card] = await db.select().from(schema.cards).where(eq(schema.cards.id, original.card.id));
    expect(card.balance).toBe(1);
    expect(await db.select().from(schema.transactions)).toHaveLength(1);
  });
});
