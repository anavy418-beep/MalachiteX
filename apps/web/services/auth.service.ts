import { apiRequest, tokenStore } from "@/lib/api";
import { SESSION_TOKEN_PLACEHOLDER } from "@/lib/auth-constants";

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  role: "USER" | "ADMIN";
  isEmailVerified: boolean;
  createdAt: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface SignupInput {
  fullName: string;
  email: string;
  password: string;
}

export interface ResetPasswordInput {
  token: string;
  password: string;
}

interface AuthResult {
  user: AuthUser;
  accessToken?: string;
  token?: string;
  auth?: {
    accessToken?: string;
    token?: string;
  };
}

const shouldDebugAuthLog =
  process.env.NODE_ENV !== "production" ||
  process.env.NEXT_PUBLIC_DEBUG_AUTH === "true";

function normalizeAuthResult(result: AuthResult | { data?: AuthResult }): AuthResult {
  const maybeNested = (result as { data?: AuthResult })?.data;
  if (maybeNested && typeof maybeNested === "object") {
    return maybeNested;
  }

  return result as AuthResult;
}

function extractAccessToken(result: AuthResult) {
  return result.accessToken ?? result.token ?? result.auth?.accessToken ?? result.auth?.token ?? null;
}

function toUsername(fullName: string): string {
  const base = fullName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 24);

  const fallback = base.length > 0 ? base : "user";
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${fallback}_${suffix}`.slice(0, 30);
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export const authService = {
  async login(input: LoginInput): Promise<AuthResult> {
    const normalizedEmail = normalizeEmail(input.email);
    const rawResult = await apiRequest<AuthResult | { data?: AuthResult }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({
        ...input,
        email: normalizedEmail,
      }),
    });
    const result = normalizeAuthResult(rawResult);

    const accessToken = extractAccessToken(result);

    if (shouldDebugAuthLog) {
      console.info("[auth-service] login response", {
        hasUser: Boolean(result.user),
        hasAccessToken: Boolean(accessToken),
        keys: Object.keys(result ?? {}),
      });
    }

    // Keep frontend auth markers in sync so protected routes resolve correctly after auth.
    tokenStore.accessToken = accessToken ?? SESSION_TOKEN_PLACEHOLDER;
    tokenStore.refreshToken = SESSION_TOKEN_PLACEHOLDER;

    return result;
  },

  async signup(input: SignupInput): Promise<AuthResult> {
    const normalizedEmail = normalizeEmail(input.email);
    const rawResult = await apiRequest<AuthResult | { data?: AuthResult }>("/auth/signup", {
      method: "POST",
      body: JSON.stringify({
        email: normalizedEmail,
        username: toUsername(input.fullName),
        password: input.password,
      }),
    });
    const result = normalizeAuthResult(rawResult);

    const accessToken = extractAccessToken(result);

    if (shouldDebugAuthLog) {
      console.info("[auth-service] signup response", {
        hasUser: Boolean(result.user),
        hasAccessToken: Boolean(accessToken),
        keys: Object.keys(result ?? {}),
      });
    }

    // Keep frontend auth markers in sync so protected routes resolve correctly after auth.
    tokenStore.accessToken = accessToken ?? SESSION_TOKEN_PLACEHOLDER;
    tokenStore.refreshToken = SESSION_TOKEN_PLACEHOLDER;

    return result;
  },

  async logout(): Promise<void> {
    try {
      await apiRequest("/auth/logout", {
        method: "POST",
      });
    } catch (error) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("Logout request failed; applying local sign-out fallback.", error);
      }
    } finally {
      tokenStore.clear();
    }
  },

  async getCurrentUser(): Promise<AuthUser> {
    const token = tokenStore.accessToken;
    return apiRequest<AuthUser>("/auth/me", {
      token: token && token !== SESSION_TOKEN_PLACEHOLDER ? token : undefined,
    });
  },

  async forgotPassword(email: string): Promise<{ requestAccepted: boolean; resetToken?: string }> {
    return apiRequest<{ requestAccepted: boolean; resetToken?: string }>("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
  },

  async resetPassword(input: ResetPasswordInput): Promise<{ passwordReset: boolean }> {
    return apiRequest<{ passwordReset: boolean }>("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
};
