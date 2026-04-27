import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  SESSION_COOKIE,
  SESSION_TOKEN_PLACEHOLDER,
} from "./auth-constants";
import { friendlyErrorMessage } from "./errors";
import { resolvedPublicApiBaseUrl } from "./runtime-config";

const API_BASE_URL = resolvedPublicApiBaseUrl;

if (!API_BASE_URL && process.env.NODE_ENV === "production") {
  throw new Error("NEXT_PUBLIC_API_BASE_URL or NEXT_PUBLIC_API_URL must be configured in production.");
}

const RESOLVED_API_BASE_URL = API_BASE_URL || "http://localhost:4000/api";
const ACCESS_TOKEN_STORAGE_KEY = "p2p_access_token";

type ApiEnvelope<T> = {
  success: boolean;
  message: string;
  data: T;
  timestamp: string;
  errors?: string[];
  statusCode?: number;
};

interface RequestOptions extends RequestInit {
  token?: string;
  skipAuthRefresh?: boolean;
}

function normalizeRequestPath(path: string) {
  const trimmed = path.trim();
  if (!trimmed) return "/";
  return `/${trimmed.replace(/^\/+/, "")}`;
}

function stripQueryAndHash(path: string) {
  return path.split("?")[0]?.split("#")[0] ?? path;
}

function baseUrlHasApiSegment(baseUrl: string) {
  try {
    const pathnameSegments = new URL(baseUrl).pathname
      .split("/")
      .map((segment) => segment.trim().toLowerCase())
      .filter(Boolean);
    return pathnameSegments.includes("api");
  } catch {
    return /\/api(?:\/|$)/i.test(baseUrl);
  }
}

function normalizeRequestPathAgainstBase(path: string) {
  const normalizedPath = normalizeRequestPath(path);
  if (!baseUrlHasApiSegment(RESOLVED_API_BASE_URL)) {
    return normalizedPath;
  }

  if (/^\/api(?:\/|$)/i.test(normalizedPath)) {
    const strippedPath = normalizedPath.replace(/^\/api(?=\/|$)/i, "");
    return strippedPath.length > 0 ? strippedPath : "/";
  }

  return normalizedPath;
}

export function resolveApiRequestUrl(path: string) {
  const normalizedPath = normalizeRequestPathAgainstBase(path);
  return `${RESOLVED_API_BASE_URL}${normalizedPath}`;
}

let refreshInFlight: Promise<boolean> | null = null;
const AUTH_REFRESH_EXCLUDED_PATHS = new Set([
  "/auth/login",
  "/auth/signup",
  "/auth/refresh",
  "/auth/forgot-password",
  "/auth/reset-password",
]);
const AUTH_BEARER_EXCLUDED_PATHS = new Set([
  "/auth/login",
  "/auth/signup",
  "/auth/refresh",
]);

function isBrowser() {
  return typeof window !== "undefined";
}

function getCookie(name: string): string | null {
  if (!isBrowser()) return null;

  const cookie = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));

  if (!cookie) return null;
  return decodeURIComponent(cookie.split("=").slice(1).join("="));
}

function setCookie(name: string, value: string, maxAgeSeconds: number) {
  if (!isBrowser()) return;
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax`;
}

function clearCookie(name: string) {
  if (!isBrowser()) return;
  document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
}

const SESSION_MARKER_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

function setSessionMarkerCookies() {
  setCookie(SESSION_COOKIE, "1", SESSION_MARKER_MAX_AGE_SECONDS);
  setCookie(ACCESS_TOKEN_COOKIE, "1", SESSION_MARKER_MAX_AGE_SECONDS);
  setCookie(REFRESH_TOKEN_COOKIE, "1", SESSION_MARKER_MAX_AGE_SECONDS);
}

function clearSessionMarkerCookies() {
  clearCookie(SESSION_COOKIE);
  clearCookie(ACCESS_TOKEN_COOKIE);
  clearCookie(REFRESH_TOKEN_COOKIE);
}

function getStoredAccessToken(): string | null {
  if (!isBrowser()) return null;
  try {
    const value = window.localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY);
    return value && value.trim().length > 0 ? value : null;
  } catch {
    return null;
  }
}

function setStoredAccessToken(value: string | null) {
  if (!isBrowser()) return;
  try {
    if (!value || value === SESSION_TOKEN_PLACEHOLDER) {
      window.localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, value);
  } catch {
    // no-op; storage can be blocked in private browsing
  }
}

function unwrapData<T>(payload: unknown): T {
  if (payload && typeof payload === "object" && "success" in payload && "data" in payload) {
    return (payload as ApiEnvelope<T>).data;
  }

  return payload as T;
}

async function parsePayload(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function rotateAccessToken(): Promise<boolean> {
  if (!tokenStore.hasSessionMarker()) {
    return false;
  }

  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const response = await fetch(`${RESOLVED_API_BASE_URL}/auth/refresh`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
        credentials: "include",
      });

      if (!response.ok) {
        // Do not clear markers here. Only /auth/me verification should clear session state.
        return false;
      }

      return true;
    })().finally(() => {
      refreshInFlight = null;
    });
  }

  return refreshInFlight;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const normalizedPath = normalizeRequestPathAgainstBase(path);
  const authPath = stripQueryAndHash(normalizedPath);
  const headers = new Headers(options.headers ?? {});
  const explicitToken =
    options.token && options.token !== SESSION_TOKEN_PLACEHOLDER ? options.token : null;
  const storedToken =
    !explicitToken && !AUTH_BEARER_EXCLUDED_PATHS.has(authPath)
      ? tokenStore.accessToken
      : null;
  const authToken =
    storedToken && storedToken !== SESSION_TOKEN_PLACEHOLDER
      ? storedToken
      : explicitToken;
  const requestUrl = resolveApiRequestUrl(normalizedPath);

  if (!headers.has("Content-Type") && options.body && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  if (authToken) {
    headers.set("Authorization", `Bearer ${authToken}`);
  }

  let response: Response;
  try {
    response = await fetch(requestUrl, {
      ...options,
      headers,
      cache: "no-store",
      credentials: "include",
    });
  } catch (error) {
    const networkError = error instanceof Error ? error : new Error(String(error));
    Object.assign(networkError as Error & { status?: number; url?: string }, {
      status: 0,
      url: requestUrl,
    });
    throw networkError;
  }

  if (
    response.status === 401 &&
    !options.skipAuthRefresh &&
    !AUTH_REFRESH_EXCLUDED_PATHS.has(authPath)
  ) {
    const renewed = await rotateAccessToken();

    if (renewed) {
      return apiRequest<T>(normalizedPath, {
        ...options,
        skipAuthRefresh: true,
      });
    }
  }

  const payload = await parsePayload(response);

  if (!response.ok) {
    const errorMessage =
      payload && typeof payload === "object" && "message" in payload
        ? String((payload as { message?: unknown }).message ?? "Request failed")
        : "Request failed";

    const apiError = new Error(friendlyErrorMessage(errorMessage)) as Error & {
      status?: number;
      url?: string;
      rawMessage?: string;
      responseBody?: unknown;
    };
    apiError.status = response.status;
    apiError.url = requestUrl;
    apiError.rawMessage = errorMessage;
    apiError.responseBody = payload;
    throw apiError;
  }

  return unwrapData<T>(payload);
}

export const tokenStore = {
  get accessToken(): string | null {
    const storedAccessToken = getStoredAccessToken();
    if (storedAccessToken) return storedAccessToken;
    return this.hasSessionMarker() ? SESSION_TOKEN_PLACEHOLDER : null;
  },
  set accessToken(value: string | null) {
    if (!value) {
      setStoredAccessToken(null);
      clearSessionMarkerCookies();
      return;
    }

    setStoredAccessToken(value);
    setSessionMarkerCookies();
  },
  get refreshToken(): string | null {
    return this.hasSessionMarker() ? SESSION_TOKEN_PLACEHOLDER : null;
  },
  set refreshToken(value: string | null) {
    if (!value) {
      clearSessionMarkerCookies();
      return;
    }

    setSessionMarkerCookies();
  },
  hasSessionMarker() {
    return Boolean(
      getStoredAccessToken() ||
      getCookie(SESSION_COOKIE) ||
      getCookie(ACCESS_TOKEN_COOKIE) ||
      getCookie(REFRESH_TOKEN_COOKIE),
    );
  },
  clear() {
    setStoredAccessToken(null);
    clearSessionMarkerCookies();
  },
};
