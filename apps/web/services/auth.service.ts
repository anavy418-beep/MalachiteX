import { apiRequest, tokenStore } from "@/lib/api";

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

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

interface AuthResult {
  user: AuthUser;
  tokens: AuthTokens;
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

    tokenStore.accessToken = result.tokens.accessToken;
    tokenStore.refreshToken = result.tokens.refreshToken;

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

    tokenStore.accessToken = result.tokens.accessToken;
    tokenStore.refreshToken = result.tokens.refreshToken;

    return result;
  },

  async logout(): Promise<void> {
    const refreshToken = tokenStore.refreshToken;

    try {
      await apiRequest("/auth/logout", {
        method: "POST",
        body: JSON.stringify({ refreshToken }),
      });
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
