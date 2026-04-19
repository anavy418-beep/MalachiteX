import {
  ACCESS_TOKEN_COOKIE,
  ACCESS_TOKEN_KEY,
  REFRESH_TOKEN_COOKIE,
  REFRESH_TOKEN_KEY,
} from "./auth-constants";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api";

type ApiEnvelope<T> = {
  success: boolean;
  message: string;
  data: T;
  timestamp: string;
};

interface RequestOptions extends RequestInit {
  token?: string;
  skipAuthRefresh?: boolean;
}

let refreshInFlight: Promise<string | null> | null = null;

function isBrowser() {
  return typeof window !== "undefined";
}

function setCookie(name: string, value: string, maxAgeSeconds: number) {
  if (!isBrowser()) return;
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax`;
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

function clearCookie(name: string) {
  if (!isBrowser()) return;
  document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
}

function unwrapData<T>(payload: unknown): T {
  if (
    payload &&
    typeof payload === "object" &&
    "success" in payload &&
    "data" in payload
  ) {
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

async function rotateAccessToken(): Promise<string | null> {
  const refreshToken = tokenStore.refreshToken;

  if (!refreshToken) {
    return null;
  }

  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ refreshToken }),
        cache: "no-store",
      });

      if (!response.ok) {
        tokenStore.clear();
        return null;
      }

      const payload = await parsePayload(response);
      const data = unwrapData<{ tokens: { accessToken: string; refreshToken: string } }>(payload);

      if (!data?.tokens?.accessToken || !data?.tokens?.refreshToken) {
        tokenStore.clear();
        return null;
      }

      tokenStore.accessToken = data.tokens.accessToken;
      tokenStore.refreshToken = data.tokens.refreshToken;
      return data.tokens.accessToken;
    })().finally(() => {
      refreshInFlight = null;
    });
  }

  return refreshInFlight;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers = new Headers(options.headers ?? {});
  const authToken = options.token ?? tokenStore.accessToken;

  if (!headers.has("Content-Type") && options.body && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  if (authToken) {
    headers.set("Authorization", `Bearer ${authToken}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
    cache: "no-store",
  });

  if (response.status === 401 && !options.skipAuthRefresh) {
    const renewedAccessToken = await rotateAccessToken();

    if (renewedAccessToken) {
      return apiRequest<T>(path, {
        ...options,
        token: renewedAccessToken,
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

    throw new Error(errorMessage);
  }

  return unwrapData<T>(payload);
}

export const tokenStore = {
  get accessToken(): string | null {
    if (!isBrowser()) return null;
    return localStorage.getItem(ACCESS_TOKEN_KEY) ?? getCookie(ACCESS_TOKEN_COOKIE);
  },
  set accessToken(value: string | null) {
    if (!isBrowser()) return;
    if (!value) {
      localStorage.removeItem(ACCESS_TOKEN_KEY);
      clearCookie(ACCESS_TOKEN_COOKIE);
      return;
    }

    localStorage.setItem(ACCESS_TOKEN_KEY, value);
    setCookie(ACCESS_TOKEN_COOKIE, value, 15 * 60);
  },
  get refreshToken(): string | null {
    if (!isBrowser()) return null;
    return localStorage.getItem(REFRESH_TOKEN_KEY) ?? getCookie(REFRESH_TOKEN_COOKIE);
  },
  set refreshToken(value: string | null) {
    if (!isBrowser()) return;
    if (!value) {
      localStorage.removeItem(REFRESH_TOKEN_KEY);
      clearCookie(REFRESH_TOKEN_COOKIE);
      return;
    }

    localStorage.setItem(REFRESH_TOKEN_KEY, value);
    setCookie(REFRESH_TOKEN_COOKIE, value, 7 * 24 * 60 * 60);
  },
  clear() {
    this.accessToken = null;
    this.refreshToken = null;
  },
};
