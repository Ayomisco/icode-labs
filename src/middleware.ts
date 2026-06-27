import { NextRequest, NextResponse } from "next/server";
import { verifyToken, COOKIE_NAME } from "@/lib/auth";

// Routes that require a logged-in user
const USER_ROUTES = ["/dashboard"];
// Routes that require an admin session
const ADMIN_ROUTES = ["/admin"];
// Auth pages — redirect away if already logged in
const AUTH_ROUTES = ["/auth/login", "/auth/register"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const token = request.cookies.get(COOKIE_NAME)?.value ?? null;
  const session = token ? await verifyToken(token) : null;

  // Redirect logged-in users away from auth pages
  if (AUTH_ROUTES.some((p) => pathname.startsWith(p))) {
    if (session) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    return NextResponse.next();
  }

  // Protect user routes
  if (USER_ROUTES.some((p) => pathname.startsWith(p))) {
    if (!session) {
      const url = new URL("/auth/login", request.url);
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  // Protect admin routes
  if (ADMIN_ROUTES.some((p) => pathname.startsWith(p))) {
    if (!session?.isAdmin) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/admin/:path*",
    "/auth/:path*",
  ],
};
