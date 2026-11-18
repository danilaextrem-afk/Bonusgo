import { afterAll, describe, expect, it } from "vitest";
import { closeYdb, ydb } from "@/server/ydb/client";
import { optDate, optText } from "@/server/ydb/values";

// Runs only when a YDB is configured (CI service container / real cloud DB).
const run = process.env.YDB_ENDPOINT ? describe : describe.skip;

run("YDB smoke", () => {
  afterAll(closeYdb);

  it("connects and reads", async () => {
    const sql = await ydb();
    const [[row]] = await sql<[{ x: number }]>`SELECT 1 + 1 AS x`;
    expect(row.x).toBe(2);
  });

  it("upsert/select with Utf8, Int32, Datetime, NULL and a serializable transaction", async () => {
    const sql = await ydb();
    const id = `smoke-${Date.now()}`;
    const now = new Date(Math.floor(Date.now() / 1000) * 1000);
    await sql`UPSERT INTO users (id, email, name, created_at, deleted_at) VALUES (${id}, ${"a@b.c"}, ${optText(null)}, ${now}, ${optDate(null)})`;
    const [[u]] = await sql<[{ id: string; email: string; name: string | null; created_at: Date }]>`SELECT id, email, name, created_at FROM users WHERE id = ${id}`;
    expect(u).toMatchObject({ id, email: "a@b.c", name: null });
    expect(new Date(u.created_at).getTime()).toBe(now.getTime());
    const counterName = `c-${id}`;
    await Promise.all(
      Array.from({ length: 5 }, () =>
        sql.begin(async (tx) => {
          const [[c]] = await tx<[{ value: number | null }]>`SELECT value FROM counters WHERE name = ${counterName}`;
          await tx`UPSERT INTO counters (name, value) VALUES (${counterName}, ${(c?.value ?? 0) + 1})`;
        }),
      ),
    );
    const [[c]] = await sql<[{ value: number }]>`SELECT value FROM counters WHERE name = ${counterName}`;
    expect(c.value).toBe(5); // serializable + automatic retries: no lost updates
    await sql`DELETE FROM users WHERE id = ${id}`;
  });

  it("INSERT on an existing primary key fails (used for uniqueness)", async () => {
    const sql = await ydb();
    const email = `dup-${Date.now()}@x.y`;
    await sql`INSERT INTO users_by_email (email, user_id) VALUES (${email}, ${"u1"})`;
    await expect(sql`INSERT INTO users_by_email (email, user_id) VALUES (${email}, ${"u2"})`).rejects.toThrow();
  });
});
