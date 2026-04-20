import {
  SESSION_COOKIE,
  SESSION_TOKEN_PLACEHOLDER,
} from "./auth-constants";
import { friendlyErrorMessage } from "./errors";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

if (!API_BASE_URL && process.env.NODE_ENV === "production") {
  throw new Error("NEXT_PUBLIC_API_BASE_URL must be configured in production.");
}

const RESOLVED_API_BASE_URL = API_BASE_URL || "http://localhost:4000/api";

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

let refreshInFlight: Promise<boolean> | null = null;
const AUTH_REFRESH_EXCLUDED_PATHS = new Set([
  "/auth/login",
  "/auth/signup",
  "/auth/refresh",
  "/auth/forgot-password",
  "/auth/reset-password",
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
        tokenStore.clear();
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
  const headers = new Headers(options.headers ?? {});
  const authToken =
    options.token && options.token !== SESSION_TOKEN_PLACEHOLDER ? options.token : null;

  if (!headers.has("Content-Type") && options.body && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  if (authToken) {
    headers.set("Authorization", `Bearer ${authToken}`);
  }

  const response = await fetch(`${RESOLVED_API_BASE_URL}${path}`, {
    ...options,
    headers,
    cache: "no-store",
    credentials: "include",
  });

  if (
    response.status === 401 &&
    !options.skipAuthRefresh &&
    !AUTH_REFRESH_EXCLUDED_PATHS.has(path)
  ) {
    const renewed = await rotateAccessToken();

    if (renewed) {
      return apiRequest<T>(path, {
        ...options,
        skipAuthRefresh: true,
      });
    }
  }

  const payload = await parsePayload(response);

  if (!response.ok) {
    if (response.status === 401) {
      tokenStore.clear();
    }

    const errorMessage =
      payload && typeof payload === "object" && "message" in payload
        ? String((payload as { message?: unknown }).message ?? "Request failed")
        : "Request failed";

    throw new Error(friendlyErrorMessage(errorMessage));
  }

  return unwrapData<T>(payload);
}

export const tokenStore = {
  get accessToken(): string | null {
    return this.hasSessionMarker() ? SESSION_TOKEN_PLACEHOLDER : null;
  },
  set accessToken(value: string | null) {
    if (!value) {
      clearCookie(SESSION_COOKIE);
      return;
    }

    setCookie(SESSION_COOKIE, "1", 7 * 24 * 60 * 60);
  },
  get refreshToken(): string | null {
    return this.hasSessionMarker() ? SESSION_TOKEN_PLACEHOLDER : null;
  },
  set refreshToken(value: string | null) {
    if (!value) {
      clearCookie(SESSION_COOKIE);
      return;
    }

    setCookie(SESSION_COOKIE, "1", 7 * 24 * 60 * 60);
  },
  hasSessionMarker() {
    return Boolean(getCookie(SESSION_COOKIE));
  },
  clear() {
    clearCookie(SESSION_COOKIE);
  },
};
