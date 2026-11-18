import "server-only";
import { cache } from "react";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { ForbiddenError } from "@/server/errors";

export type User = typeof schema.users.$inferSelect;

export const SESSION_COOKIE = "bg_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function sha256(v: string): string {
  return createHash("sha256").update(v).digest("hex");
}

export async function createSession(userId: string): Promise<{ expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  let ip: string | null = null;
  let userAgent: string | null = null;
  try {
    const h = await headers();
    ip = h.get("x-forwarded-for")?.split(",")[0]?.trim().slice(0, 64) || h.get("x-real-ip")?.slice(0, 64) || null;
    userAgent = h.get("user-agent")?.slice(0, 300) ?? null;
  } catch {
    /* no request scope */
  }
  await db.insert(schema.sessions).values({
    id: sha256(token),
    userId,
    csrfToken: randomBytes(32).toString("base64url"),
    expiresAt,
    ip,
    userAgent,
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
  return { expiresAt };
}

async function readSessionToken(): Promise<string | null> {
  try {
    const jar = await cookies();
    const v = jar.get(SESSION_COOKIE)?.value;
    return v && v.length <= 200 ? v : null;
  } catch {
    return null;
  }
}

const loadSession = cache(async () => {
  const token = await readSessionToken();
  if (!token) return null;
  const rows = await db
    .select({ session: schema.sessions, user: schema.users })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(and(eq(schema.sessions.id, sha256(token)), gt(schema.sessions.expiresAt, new Date()), isNull(schema.users.deletedAt)))
    .limit(1);
  return rows[0] ?? null;
});

export const getCurrentUser = cache(async (): Promise<User | null> => {
  const s = await loadSession();
  return s?.user ?? null;
});

export async function requireUser(): Promise<User> {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  return u;
}

/**
 * Admin access comes only from the database role. Emails are not verified, so an ADMIN_EMAILS
 * allow-list would let anyone who registers that address first become admin.
 * ADMIN_EMAILS is honoured only outside production (tests, local dev).
 */
export function isPlatformAdmin(u: Pick<User, "platformRole" | "email">): boolean {
  if (u.platformRole === "ADMIN") return true;
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_TEST_PAYMENTS !== "true") return false;
  const list = (process.env.ADMIN_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return list.includes(u.email.toLowerCase());
}

export async function requirePlatformAdmin(): Promise<User> {
  const u = await getCurrentUser();
  // Logged out → sign in and come back; logged in without the role → 404 (don't reveal the page).
  if (!u) redirect("/login?next=%2Fadmin");
  if (!isPlatformAdmin(u)) notFound();
  return u;
}

export async function destroySession(): Promise<void> {
  const token = await readSessionToken();
  if (token) await db.delete(schema.sessions).where(eq(schema.sessions.id, sha256(token)));
  try {
    const jar = await cookies();
    jar.delete(SESSION_COOKIE);
  } catch {
    /* ignore */
  }
}

export async function getCsrfToken(): Promise<string> {
  const s = await loadSession();
  return s?.session.csrfToken ?? "";
}

export async function verifyCsrf(token: string | null | undefined): Promise<boolean> {
  if (!token) return false;
  const expected = await getCsrfToken();
  if (!expected) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Rejects cross-site state-changing requests: Origin must match Host / X-Forwarded-Host. */
export function assertSameOrigin(req: Request): void {
  const origin = req.headers.get("origin");
  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").split(",")[0].trim().toLowerCase();
  if (!origin || !host) throw new ForbiddenError("Запрос отклонён (проверка источника).");
  let originHost: string;
  try {
    originHost = new URL(origin).host.toLowerCase();
  } catch {
    throw new ForbiddenError("Запрос отклонён (проверка источника).");
  }
  if (originHost !== host) throw new ForbiddenError("Запрос отклонён (проверка источника).");
}
