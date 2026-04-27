export const ACCESS_TOKEN_COOKIE = "p2p_at";
export const REFRESH_TOKEN_COOKIE = "p2p_rt";
export const SESSION_COOKIE = "p2p_session";
export const SESSION_TOKEN_PLACEHOLDER = "__cookie_session__";

export const AUTH_ROUTE_PATHS = [
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
] as const;

export const PROTECTED_ROUTE_PREFIXES = [
  "/dashboard",
  "/wallet",
  "/offers",
  "/trades",
  "/deposits",
  "/withdrawals",
] as const;
