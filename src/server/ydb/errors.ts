/** True when an INSERT hit an existing primary key (used for uniqueness via lookup tables). */
export function isDuplicate(e: unknown): boolean {
  const msg = e instanceof Error ? `${e.message} ${String((e as { issues?: unknown }).issues ?? "")}` : String(e);
  return /already exist|duplicate|PRECONDITION_FAILED|Conflict with existing key/i.test(msg);
}

/** `sql.begin` wraps non-retryable errors (incl. our AppErrors) as Error("Transaction failed.", { cause }). */
export const unwrapTx = (e: unknown): unknown => (e instanceof Error && e.message === "Transaction failed." && e.cause !== undefined ? e.cause : e);

/** Runs a serializable transaction and rethrows the original error instead of the SDK wrapper. */
export async function inTx<T>(sql: { begin: <R>(fn: (tx: never) => Promise<R>) => Promise<R> }, fn: (tx: never) => Promise<T>): Promise<T> {
  try {
    return await sql.begin(fn);
  } catch (e) {
    throw unwrapTx(e);
  }
}
