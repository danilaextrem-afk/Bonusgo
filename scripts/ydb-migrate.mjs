// Applies ydb/schema.yql statement by statement (CREATE TABLE IF NOT EXISTS → idempotent).
import { readFileSync } from "node:fs";
import { Driver } from "@ydbjs/core";
import { query, unsafe } from "@ydbjs/query";

const { YDB_ENDPOINT, YDB_DATABASE, YDB_SA_KEY } = process.env;
if (!YDB_ENDPOINT || !YDB_DATABASE) {
  console.log("YDB not configured, skipping migration");
  process.exit(0);
}
let opts = {};
if (YDB_SA_KEY) {
  const { ServiceAccountCredentialsProvider } = await import("@ydbjs/auth-yandex-cloud");
  opts = { credentialsProvider: new ServiceAccountCredentialsProvider(JSON.parse(YDB_SA_KEY)) };
}
const driver = new Driver(`${YDB_ENDPOINT.replace(/\/$/, "")}${YDB_DATABASE}`, opts);
await driver.ready(AbortSignal.timeout(60_000));
const sql = query(driver);
const statements = readFileSync(new URL("../ydb/schema.yql", import.meta.url), "utf8")
  .split("\n").filter((l) => !l.trim().startsWith("--")).join("\n")
  .split(";").map((s) => s.trim()).filter(Boolean);
for (const s of statements) {
  await sql`${unsafe(s)}`;
  console.log("ok:", s.slice(0, 60).replace(/\s+/g, " "));
}
driver.close();
console.log(`YDB schema applied (${statements.length} statements)`);
