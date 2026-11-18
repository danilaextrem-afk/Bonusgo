import "server-only";
import { cache } from "react";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ForbiddenError } from "@/server/errors";
import { ydb } from "@/server/ydb/client";
import { camel, type Session, type User } from "@/server/ydb/rows";
import { nowSec, optText } from "@/server/ydb/values";

export type { User };

export const SESSION_COOKIE = "bg_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function sha256(v: string): string {
  return createHash("sha256").update(v).digest("hex");
}

export async function createSession(userId: string): Promise<{ expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Math.floor((Date.now() + SESSION_TTL_MS) / 1000) * 1000);
  let ip: string | null = null;
  let userAgent: string | null = null;
  try {
    const h = await headers();
    ip = h.get("x-forwarded-for")?.split(",")[0]?.trim().slice(0, 64) || h.get("x-real-ip")?.slice(0, 64) || null;
    userAgent = h.get("user-agent")?.slice(0, 300) ?? null;
  } catch {
    /* no request scope */
  }
  const sql = await ydb();
  await sql`INSERT INTO sessions (id, user_id, csrf_token, expires_at, ip, user_agent, created_at)
            VALUES (${sha256(token)}, ${userId}, ${randomBytes(32).toString("base64url")}, ${expiresAt}, ${optText(ip)}, ${optText(userAgent)}, ${nowSec()})`;
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
  const sql = await ydb();
  const [[s]] = await sql<[Record<string, unknown>]>`SELECT * FROM sessions WHERE id = ${sha256(token)} AND expires_at > ${new Date()}`;
  if (!s) return null;
  const session = camel<Session>(s);
  const [[u]] = await sql<[Record<string, unknown>]>`SELECT * FROM users WHERE id = ${session.userId} AND deleted_at IS NULL`;
  if (!u) return null;
  return { session, user: camel<User>(u) };
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
  if (token) {
    const sql = await ydb();
    await sql`DELETE FROM sessions WHERE id = ${sha256(token)}`;
  }
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
