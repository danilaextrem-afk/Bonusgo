# YDB migration conventions (Drizzle/Postgres → YDB)

Goal: replace every `db`/Drizzle query with YQL via `@ydbjs/query`, keeping **exported function names, signatures and return shapes unchanged** (camelCase objects, `Date` for timestamps, `number` for ints) so UI code keeps working.

## Access
```ts
import { ydb } from "@/server/ydb/client";
import { optText, optInt, optBool, optDate, optJson, json, nowSec, num } from "@/server/ydb/values";
const sql = await ydb();
const [rows] = await sql<[Row[]]>`SELECT ... WHERE id = ${id}`;       // first result set
await sql.begin(async (tx) => { await tx`...`; });                   // serializable, auto-retried on conflicts
```
- Parameters: string, integer number (Int32), boolean, Date (Datetime) bind directly. **Never pass `null`/`undefined`** — use `optText/optInt/optBool/optDate/optJson`. Use `json(v)` for non-null JsonDocument.
- Datetime has second precision: use `nowSec()` for "now" and round dates you write.
- `COUNT(*)`/Uint64 come back as bigint → wrap with `num()`.
- Columns are snake_case (see `ydb/schema.yql`); map rows to the existing camelCase types (`src/server/ydb/rows.ts`).
- Identifiers: `createId()` from `src/server/id.ts`.

## Transactions & concurrency
- `sql.begin` is SERIALIZABLE with optimistic locks; conflicting transactions are aborted and **the whole callback is retried** — so callbacks must be side-effect free outside the DB (no audit/notify/fetch inside; do them after commit).
- This replaces `SELECT ... FOR UPDATE` and `pg_advisory_xact_lock`: read the rows you depend on inside the tx; a concurrent change aborts one tx.
- Throwing an app error inside `begin` rolls back and is not retried (only YDB retryable errors are).

## Uniqueness (no unique indexes)
Lookup tables whose primary key is the unique value; `INSERT INTO` fails on duplicates (UPSERT does not):
- users.email → `users_by_email(email, user_id)`
- venues.slug → `venues_by_slug(slug, venue_id)`
- transactions.idempotency_key → `idempotency_keys(key, company_id, transaction_id)`
- payment_events.event_key, customer_tokens.token_hash, password_resets.token_hash, rate_limits.key, sessions.id are primary keys themselves.
- memberships PK (company_id, user_id); cards PK (program_id, customer_id); referrals PK referred_company_id.
- payments.invoice_no: allocate inside the payment-creating tx from `counters` (name = 'invoice_no').
A duplicate INSERT raises a YDBError (status PRECONDITION_FAILED / "already exists"); use `isDuplicate(e)` from `src/server/ydb/errors.ts`.

## Secondary indexes
Query through them with `VIEW`: `SELECT * FROM sessions VIEW idx_user WHERE user_id = ${id}`.

## Tests
- Postgres tests in `tests/integration` are replaced by `tests/ydb/<area>.test.ts` (run only when `YDB_ENDPOINT` is set — locally there is no YDB; CI job `YDB` runs them against a real local YDB).
- Use `tests/ydb/helpers.ts` (`resetYdb`, `makeUser`, `makeCompany`, `makeSetup`, next/headers mocks).
- To test: commit on your branch, push, wait for the `ydb-tests` check, read logs:
  `env -u GH_TOKEN gh api repos/danilaextrem-afk/Bonusgo/commits/<sha>/check-runs` and `.../actions/jobs/<id>/logs`.
