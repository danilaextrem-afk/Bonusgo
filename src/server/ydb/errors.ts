/** True when an INSERT hit an existing primary key (used for uniqueness via lookup tables). */
export function isDuplicate(e: unknown): boolean {
  const msg = e instanceof Error ? `${e.message} ${String((e as { issues?: unknown }).issues ?? "")}` : String(e);
  return /already exist|duplicate|PRECONDITION_FAILED|Conflict with existing key/i.test(msg);
}
