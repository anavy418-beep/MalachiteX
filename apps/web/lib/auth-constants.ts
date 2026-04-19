export const ACCESS_TOKEN_KEY = "accessToken";
export const REFRESH_TOKEN_KEY = "refreshToken";

export const ACCESS_TOKEN_COOKIE = "p2p_at";
export const REFRESH_TOKEN_COOKIE = "p2p_rt";

export const AUTH_ROUTE_PATHS = [
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
] as const;

export const PROTECTED_ROUTE_PREFIXES = [
  "/dashboard",
  "/wallet",
  "/trades",
  "/deposits",
  "/withdrawals",
] as const;
