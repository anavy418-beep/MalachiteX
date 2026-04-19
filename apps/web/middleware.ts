import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  ACCESS_TOKEN_COOKIE,
  AUTH_ROUTE_PATHS,
  PROTECTED_ROUTE_PREFIXES,
  REFRESH_TOKEN_COOKIE,
} from "./lib/auth-constants";

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const hasAccessToken = Boolean(request.cookies.get(ACCESS_TOKEN_COOKIE)?.value);
  const hasRefreshToken = Boolean(request.cookies.get(REFRESH_TOKEN_COOKIE)?.value);
  const isAuthenticated = hasAccessToken || hasRefreshToken;

  const isProtectedRoute = PROTECTED_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  const isAuthRoute = AUTH_ROUTE_PATHS.some((route) => pathname === route);

  if (isProtectedRoute && !isAuthenticated) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  if (isAuthRoute && isAuthenticated) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/wallet/:path*",
    "/trades/:path*",
    "/deposits",
    "/withdrawals",
    "/login",
    "/signup",
    "/forgot-password",
    "/reset-password",
  ],
};
