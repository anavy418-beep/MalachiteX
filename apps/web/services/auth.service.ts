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

export const authService = {
  async login(input: LoginInput): Promise<AuthResult> {
    const result = await apiRequest<AuthResult>("/auth/login", {
      method: "POST",
      body: JSON.stringify(input),
    });

    // Keep frontend auth markers in sync so protected routes resolve correctly after auth.
    tokenStore.accessToken = SESSION_TOKEN_PLACEHOLDER;
    tokenStore.refreshToken = SESSION_TOKEN_PLACEHOLDER;

    return result;
  },

  async signup(input: SignupInput): Promise<AuthResult> {
    const result = await apiRequest<AuthResult>("/auth/signup", {
      method: "POST",
      body: JSON.stringify({
        email: input.email,
        username: toUsername(input.fullName),
        password: input.password,
      }),
    });

    // Keep frontend auth markers in sync so protected routes resolve correctly after auth.
    tokenStore.accessToken = SESSION_TOKEN_PLACEHOLDER;
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
    return apiRequest<AuthUser>("/auth/me");
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
