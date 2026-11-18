import "server-only";
import { ZodError, type ZodType } from "zod";
import { AppError } from "@/server/errors";

/** Error with a message that is safe to show to the user. */
export class UiError extends Error {
  constructor(message: string, public upsell = false) {
    super(message);
  }
}

export function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
}

export function formObject(fd: FormData): Record<string, string> {
  const o: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (typeof v === "string") o[k] = v;
  return o;
}

export function parseForm<T>(schema: ZodType<T>, fd: FormData): T {
  return schema.parse(formObject(fd));
}

function isNextControl(e: unknown): boolean {
  if (typeof e !== "object" || e === null || !("digest" in e)) return false;
  return String((e as { digest: unknown }).digest).startsWith("NEXT_");
}

export function describeError(e: unknown): { error: string; upsell?: boolean } {
  if (e instanceof UiError) return { error: e.message, upsell: e.upsell };
  if (e instanceof ZodError) return { error: e.issues[0]?.message ?? "Проверьте введённые данные" };
  if (e instanceof AppError) {
    if (e.code === "PLAN_LIMIT") return { error: e.message, upsell: true };
    return { error: e.message };
  }
  console.error("[app-action]", e);
  return { error: "Что-то пошло не так. Попробуйте ещё раз чуть позже." };
}

export type Guarded<T> = { ok: true; data: T } | { ok: false; error: string; upsell?: boolean };

/** Runs fn, converting known errors to friendly messages. Redirect/notFound signals pass through. */
export async function guard<T>(fn: () => Promise<T>): Promise<Guarded<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (isNextControl(e)) throw e;
    return { ok: false, ...describeError(e) };
  }
}

export function optText(max: number) {
  return (v: string | undefined) => {
    const t = (v ?? "").trim();
    return t === "" ? undefined : t.slice(0, max);
  };
}
