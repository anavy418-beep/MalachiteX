export const ACCESS_TOKEN_COOKIE = "p2p_at";
export const REFRESH_TOKEN_COOKIE = "p2p_rt";
export const SESSION_COOKIE = "p2p_session";

type SameSitePolicy = "lax" | "strict" | "none";
type CookieOptionsLike = {
  httpOnly: boolean;
  secure: boolean;
  sameSite: SameSitePolicy;
  path: string;
  maxAge: number;
};
type CookieResponse = {
  cookie: (name: string, value: string, options: CookieOptionsLike) => void;
};

function isSecureCookieEnabled() {
  if (process.env.COOKIE_SECURE) {
    return process.env.COOKIE_SECURE === "true";
  }

  return process.env.NODE_ENV === "production";
}

function getSameSitePolicy(): SameSitePolicy {
  const configured = process.env.COOKIE_SAME_SITE?.trim().toLowerCase();
  if (configured === "strict" || configured === "lax" || configured === "none") {
    return configured;
  }

  return isSecureCookieEnabled() ? "none" : "lax";
}

function buildCookieOptions(maxAgeMs: number, httpOnly: boolean): CookieOptionsLike {
  return {
    httpOnly,
    secure: isSecureCookieEnabled(),
    sameSite: getSameSitePolicy(),
    path: "/",
    maxAge: maxAgeMs,
  };
}

export function setAuthCookies(
  response: CookieResponse,
  input: {
    accessToken: string;
    accessTokenMaxAgeMs: number;
    refreshToken: string;
    refreshTokenMaxAgeMs: number;
  },
) {
  response.cookie(
    ACCESS_TOKEN_COOKIE,
    input.accessToken,
    buildCookieOptions(input.accessTokenMaxAgeMs, true),
  );
  response.cookie(
    REFRESH_TOKEN_COOKIE,
    input.refreshToken,
    buildCookieOptions(input.refreshTokenMaxAgeMs, true),
  );
  response.cookie(SESSION_COOKIE, "1", buildCookieOptions(input.refreshTokenMaxAgeMs, false));
}

export function clearAuthCookies(response: CookieResponse) {
  const expiredHttpOnlyOptions = buildCookieOptions(0, true);
  const expiredReadableOptions = buildCookieOptions(0, false);

  response.cookie(ACCESS_TOKEN_COOKIE, "", expiredHttpOnlyOptions);
  response.cookie(REFRESH_TOKEN_COOKIE, "", expiredHttpOnlyOptions);
  response.cookie(SESSION_COOKIE, "", expiredReadableOptions);
}
