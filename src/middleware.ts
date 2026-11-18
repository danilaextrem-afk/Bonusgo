import { NextResponse, type NextRequest } from "next/server";

/**
 * Old domain → new domain after the rebrand. Set REDIRECT_TO (e.g. https://qronus.onrender.com)
 * only on the retired deployment; every path is permanently redirected, preserving path and query.
 */
export function middleware(req: NextRequest) {
  const target = process.env.REDIRECT_TO;
  if (!target) return NextResponse.next();
  const url = new URL(req.nextUrl.pathname + req.nextUrl.search, target);
  return NextResponse.redirect(url, 308);
}

export const config = { matcher: "/:path*" };
