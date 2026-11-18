import { Driver } from "@ydbjs/core";
import { query } from "@ydbjs/query";

/**
 * YDB (Yandex Managed Service for YDB, serverless, servers in Russia) connection.
 * Env:
 *   YDB_ENDPOINT   grpcs://ydb.serverless.yandexcloud.net:2135   (local: grpc://localhost:2136)
 *   YDB_DATABASE   /ru-central1/<cloud>/<db>                     (local: /local)
 *   YDB_SA_KEY     service-account authorized key JSON (production only; never in git)
 */
type Sql = ReturnType<typeof query>;
const g = globalThis as unknown as { ydbDriver?: Driver; ydbSql?: Sql; ydbReady?: Promise<unknown> };

async function credentials() {
  const raw = process.env.YDB_SA_KEY;
  if (!raw) return undefined; // local YDB in tests/CI runs without auth
  const { ServiceAccountCredentialsProvider } = await import("@ydbjs/auth-yandex-cloud");
  return new ServiceAccountCredentialsProvider(JSON.parse(raw));
}

export async function ydb(): Promise<Sql> {
  if (g.ydbSql) {
    await g.ydbReady;
    return g.ydbSql;
  }
  const endpoint = process.env.YDB_ENDPOINT;
  const database = process.env.YDB_DATABASE;
  if (!endpoint || !database) throw new Error("YDB_ENDPOINT / YDB_DATABASE are not configured");
  const credentialsProvider = await credentials();
  const driver = new Driver(`${endpoint.replace(/\/$/, "")}${database}`, credentialsProvider ? { credentialsProvider } : {});
  g.ydbDriver = driver;
  g.ydbReady = driver.ready();
  g.ydbSql = query(driver);
  await g.ydbReady;
  return g.ydbSql;
}

export async function closeYdb() {
  g.ydbDriver?.close();
  g.ydbDriver = undefined;
  g.ydbSql = undefined;
  g.ydbReady = undefined;
}
