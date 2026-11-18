import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("next/headers", async () => (await import("./helpers")).nextHeadersMock);
vi.mock("next/navigation", async () => (await import("./helpers")).nextNavigationMock);
import { closeYdb, ydb } from "@/server/ydb/client";
import { createId } from "@/server/id";
import { nowSec } from "@/server/ydb/values";
import {
  assertCanAddActiveCustomer, assertCanAddProgram, assertCanAddStaff, assertCanAddVenue, assertFeature, assertOperationAllowed, brandingAllowed,
  effectivePlan, getUsage, withLimitLock,
} from "@/server/limits";
import { getMembership, getUserCompanies, requireMembership } from "@/server/tenancy";
import { createSession } from "@/server/auth/session";
import { listPrograms, listRewards, listVenues } from "@/components/app/data";
import { ForbiddenError, LimitError, NotFoundError } from "@/server/errors";
import { makeCompany, makeSetup, makeUser, reqState, resetYdb } from "./helpers";

type Row = Record<string, unknown>;
const run = process.env.YDB_ENDPOINT ? describe : describe.skip;
const q = async (strings: TemplateStringsArray, ...values: unknown[]) => {
  const sql = await ydb();
  const [rows] = await sql<[Row]>(strings, ...values);
  return rows;
};
const later = (sec: number) => new Date(nowSec().getTime() + sec * 1000);
const downgrade = (companyId: string) => q`UPDATE companies SET plan = ${"FREE"}, plan_expires_at = NULL WHERE id = ${companyId}`;

async function addVenue(companyId: string, createdAt = nowSec()) {
  const id = createId();
  await q`UPSERT INTO venues (id, company_id, name, slug, brand_color, created_at) VALUES (${id}, ${companyId}, ${"V"}, ${`s-${id}`}, ${"#39FF88"}, ${createdAt})`;
  return id;
}
async function addProgram(companyId: string, venueId: string, createdAt = nowSec()) {
  const id = createId();
  await q`UPSERT INTO programs (id, company_id, venue_id, type, name, stamps_required, points_percent, reward_text, active, created_at)
          VALUES (${id}, ${companyId}, ${venueId}, ${"STAMPS"}, ${"P"}, ${5}, ${5}, ${"Кофе"}, ${true}, ${createdAt})`;
  return id;
}
async function addMember(companyId: string, userId: string, role: "MANAGER" | "STAFF", createdAt = nowSec()) {
  const id = createId();
  await q`UPSERT INTO memberships (company_id, user_id, id, role, created_at) VALUES (${companyId}, ${userId}, ${id}, ${role}, ${createdAt})`;
  return id;
}
async function addCard(companyId: string, programId: string, lastActivity: Date) {
  const customerId = createId();
  await q`UPSERT INTO cards (program_id, customer_id, id, company_id, balance, last_activity_at, created_at)
          VALUES (${programId}, ${customerId}, ${createId()}, ${companyId}, ${0}, ${lastActivity}, ${nowSec()})`;
  return customerId;
}

run("YDB limits & tenancy", () => {
  beforeEach(async () => {
    await resetYdb();
    reqState.cookies.clear();
    reqState.headers.clear();
  });
  afterAll(closeYdb);

  it("expired paid plan behaves as FREE", async () => {
    expect(effectivePlan({ plan: "PRO", planExpiresAt: new Date(Date.now() - 1000) })).toBe("FREE");
    expect(effectivePlan({ plan: "PRO", planExpiresAt: null })).toBe("PRO");
    const { company } = await makeSetup({ plan: "PRO" });
    await q`UPDATE companies SET plan_expires_at = ${new Date(nowSec().getTime() - 1000)} WHERE id = ${company.id}`;
    expect((await getUsage(company.id)).plan).toBe("FREE");
    await expect(assertFeature(company.id, "rewards")).rejects.toBeInstanceOf(LimitError);
  });

  it("creation limits: venues, programs, POINTS, staff, unknown company", async () => {
    const { owner, company, venue } = await makeSetup(); // FREE: 1 venue, 1 program
    await expect(assertCanAddVenue(company.id)).rejects.toMatchObject({ limit: "venues" });
    await expect(assertCanAddProgram(company.id, "STAMPS")).rejects.toBeInstanceOf(LimitError);
    await expect(assertCanAddProgram(company.id, "POINTS")).rejects.toBeInstanceOf(LimitError);
    await expect(assertCanAddStaff(company.id)).rejects.toBeInstanceOf(LimitError);
    await expect(assertCanAddVenue("missing")).rejects.toBeInstanceOf(NotFoundError);
    const pro = await makeCompany(owner.id, { plan: "PRO", planExpiresAt: later(86400) });
    await expect(assertCanAddProgram(pro.id, "POINTS")).resolves.toBeUndefined();
    await expect(assertCanAddStaff(pro.id)).resolves.toBeUndefined();
    for (let i = 0; i < 3; i++) await addMember(pro.id, (await makeUser()).id, "STAFF");
    await expect(assertCanAddStaff(pro.id)).rejects.toBeInstanceOf(LimitError);
    expect(await getUsage(pro.id)).toMatchObject({ plan: "PRO", staff: 3, venues: 0, programs: 0, activeCustomers: 0 });
    expect(await getUsage(company.id)).toMatchObject({ plan: "FREE", staff: 0, venues: 1, programs: 1 });
    expect(venue.id).toBeTruthy();
  });

  it("FREE plan: 101st active customer is blocked, inactive customers don't count", async () => {
    const { company, program } = await makeSetup();
    const old = new Date(nowSec().getTime() - 100 * 86400_000);
    for (let i = 0; i < 10; i++) await addCard(company.id, program.id, old);
    const active: string[] = [];
    for (let b = 0; b < 10; b++) active.push(...(await Promise.all(Array.from({ length: 10 }, () => addCard(company.id, program.id, nowSec())))));
    expect((await getUsage(company.id)).activeCustomers).toBe(100);
    await expect(assertCanAddActiveCustomer(company.id)).rejects.toMatchObject({ limit: "activeCustomers" });
    await q`DELETE FROM cards WHERE program_id = ${program.id} AND customer_id = ${active[0]}`;
    await expect(assertCanAddActiveCustomer(company.id)).resolves.toBeUndefined();
  });

  it("use-time enforcement: items above the FREE limit are frozen after downgrade; the oldest keep working", async () => {
    const { owner, company, venue, program } = await makeSetup({ plan: "TOP" });
    const v2 = await addVenue(company.id, later(5));
    const p2 = await addProgram(company.id, v2, later(5));
    const staffUser = await makeUser();
    const staffId = await addMember(company.id, staffUser.id, "STAFF");
    const [ownerM] = await q`SELECT id FROM memberships WHERE company_id = ${company.id} AND user_id = ${owner.id}`;
    const ownerMembership = { id: String(ownerM.id), role: "OWNER" as const };
    const top = { id: company.id, plan: "TOP" as const, planExpiresAt: later(86400) };
    await expect(assertOperationAllowed(top, { id: p2, venueId: v2, type: "STAMPS" }, { id: staffId, role: "STAFF" })).resolves.toBeUndefined();
    await downgrade(company.id);
    const free = { id: company.id, plan: "FREE" as const, planExpiresAt: null };
    await expect(assertOperationAllowed(free, { id: p2, venueId: v2, type: "STAMPS" }, ownerMembership)).rejects.toBeInstanceOf(LimitError);
    await expect(assertOperationAllowed(free, { id: program.id, venueId: venue.id, type: "STAMPS" }, ownerMembership)).resolves.toBeUndefined();
    await expect(assertOperationAllowed(free, { id: program.id, venueId: venue.id, type: "STAMPS" }, { id: staffId, role: "STAFF" })).rejects.toBeInstanceOf(LimitError);
    await expect(assertOperationAllowed(free, { id: program.id, venueId: venue.id, type: "POINTS" }, ownerMembership)).rejects.toBeInstanceOf(LimitError);
    await expect(assertOperationAllowed(free, { id: program.id, venueId: venue.id, type: "STAMPS" }, ownerMembership, { usesReward: true })).rejects.toBeInstanceOf(LimitError);
    expect(brandingAllowed(free)).toBe(false);
    expect(brandingAllowed(top)).toBe(true);
  });

  it("PRO staff: only the oldest `staff` limit members may operate", async () => {
    const { company, program } = await makeSetup({ plan: "PRO" });
    const ids: string[] = [];
    for (let i = 0; i < 4; i++) ids.push(await addMember(company.id, (await makeUser()).id, "STAFF", later(i * 2)));
    const pro = { id: company.id, plan: "PRO" as const, planExpiresAt: later(86400) };
    const op = { id: program.id, venueId: program.venueId, type: "STAMPS" as const };
    for (const id of ids.slice(0, 3)) await expect(assertOperationAllowed(pro, op, { id, role: "STAFF" })).resolves.toBeUndefined();
    await expect(assertOperationAllowed(pro, op, { id: ids[3], role: "STAFF" })).rejects.toBeInstanceOf(LimitError);
  });

  describe("limit checks cannot be raced", () => {
    it("10 parallel venue creations on FREE create exactly one", async () => {
      const u = await makeUser();
      const c = await makeCompany(u.id);
      const results = await Promise.allSettled(
        Array.from({ length: 10 }, (_, i) =>
          withLimitLock(c.id, "venue", async (tx) => {
            await assertCanAddVenue(c.id, tx);
            const id = createId();
            await tx`UPSERT INTO venues (id, company_id, name, slug, brand_color, created_at) VALUES (${id}, ${c.id}, ${`Точка ${i}`}, ${`t-${id}`}, ${"#39FF88"}, ${nowSec()})`;
            return id;
          }),
        ),
      );
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      for (const r of results) if (r.status === "rejected") expect(r.reason).toBeInstanceOf(LimitError);
      expect(await q`SELECT id FROM venues VIEW idx_company WHERE company_id = ${c.id}`).toHaveLength(1);
    });

    it("parallel program creations respect the PRO limit of 3", async () => {
      const { company, venue } = await makeSetup({ plan: "PRO" }); // already has 1 program
      await Promise.allSettled(
        Array.from({ length: 8 }, () =>
          withLimitLock(company.id, "program", async (tx) => {
            await assertCanAddProgram(company.id, "STAMPS", tx);
            await tx`UPSERT INTO programs (id, company_id, venue_id, type, name, stamps_required, points_percent, reward_text, active, created_at)
                     VALUES (${createId()}, ${company.id}, ${venue.id}, ${"STAMPS"}, ${"P"}, ${5}, ${5}, ${"Кофе"}, ${true}, ${nowSec()})`;
          }),
        ),
      );
      expect(await q`SELECT id FROM programs VIEW idx_company WHERE company_id = ${company.id}`).toHaveLength(3);
    });

    it("parallel staff additions respect the PRO limit of 3", async () => {
      const { company } = await makeSetup({ plan: "PRO" });
      const users = await Promise.all(Array.from({ length: 6 }, () => makeUser()));
      await Promise.allSettled(
        users.map((u) =>
          withLimitLock(company.id, "staff", async (tx) => {
            await assertCanAddStaff(company.id, tx);
            await tx`INSERT INTO memberships (company_id, user_id, id, role, created_at) VALUES (${company.id}, ${u.id}, ${createId()}, ${"STAFF"}, ${nowSec()})`;
          }),
        ),
      );
      expect((await getUsage(company.id)).staff).toBe(3);
    });
  });

  describe("tenancy", () => {
    it("lists own companies in membership order, skips deleted ones", async () => {
      const u = await makeUser();
      const a = await makeCompany(u.id, { name: "A" });
      const other = await makeUser();
      const b = await makeCompany(other.id, { name: "B" });
      await addMember(b.id, u.id, "STAFF", later(5));
      const d = await makeCompany(u.id, { name: "D" });
      await q`UPDATE companies SET deleted_at = ${nowSec()} WHERE id = ${d.id}`;
      const list = await getUserCompanies(u.id);
      expect(list.map((x) => [x.company.name, x.role])).toEqual([["A", "OWNER"], ["B", "STAFF"]]);
      expect(list[0].company).toMatchObject({ id: a.id, plan: "FREE", deletedAt: null });
      expect(list[1].membership).toMatchObject({ companyId: b.id, userId: u.id, role: "STAFF" });
      expect(await getMembership(u.id, d.id)).toBeNull();
    });

    it("requireMembership: other tenants and insufficient roles are forbidden", async () => {
      const { owner, company } = await makeSetup();
      const stranger = await makeUser();
      const other = await makeCompany(stranger.id);
      await expect(requireMembership(company.id)).rejects.toThrow(/NEXT_REDIRECT:\/login/);
      await createSession(owner.id);
      const m = await requireMembership(company.id, ["OWNER", "MANAGER"]);
      expect(m.user.id).toBe(owner.id);
      expect(m.membership.role).toBe("OWNER");
      await expect(requireMembership(other.id)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(requireMembership("")).rejects.toBeInstanceOf(ForbiddenError);
      const staff = await makeUser();
      await addMember(company.id, staff.id, "STAFF");
      reqState.cookies.clear();
      await createSession(staff.id);
      await expect(requireMembership(company.id, ["OWNER", "MANAGER"])).rejects.toBeInstanceOf(ForbiddenError);
      await expect(requireMembership(company.id)).resolves.toMatchObject({ membership: { role: "STAFF" } });
    });

    it("own-tenant listings", async () => {
      const { company, venue, program } = await makeSetup({ plan: "TOP" });
      const v2 = await addVenue(company.id, later(5));
      await q`UPSERT INTO rewards (id, company_id, program_id, title, cost, active, created_at) VALUES
              (${createId()}, ${company.id}, ${program.id}, ${"Big"}, ${50}, ${true}, ${nowSec()}),
              (${createId()}, ${company.id}, ${program.id}, ${"Small"}, ${5}, ${true}, ${nowSec()})`;
      expect((await listVenues(company.id)).map((v) => v.id)).toEqual([venue.id, v2]);
      expect((await listPrograms(company.id))[0]).toMatchObject({ id: program.id, stampsRequired: 10, active: true });
      expect((await listRewards(company.id)).map((r) => r.title)).toEqual(["Small", "Big"]);
      expect(await listVenues("nobody")).toEqual([]);
    });
  });
});
