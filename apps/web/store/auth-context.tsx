"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { tokenStore } from "@/lib/api";
import { authService, type AuthUser, type LoginInput, type SignupInput } from "@/services/auth.service";
import { apiHealthService } from "@/services/api-health.service";

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isBootstrapping: boolean;
  login: (input: LoginInput) => Promise<AuthUser>;
  signup: (input: SignupInput) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<AuthUser | null>;
  forgotPassword: (email: string) => Promise<{ requestAccepted: boolean; resetToken?: string }>;
  resetPassword: (input: { token: string; password: string }) => Promise<{ passwordReset: boolean }>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const SESSION_VERIFY_MAX_ATTEMPTS = 2;
const SESSION_VERIFY_RETRY_DELAY_MS = 450;
const shouldDebugAuthLog =
  process.env.NODE_ENV !== "production" ||
  process.env.NEXT_PUBLIC_DEBUG_AUTH === "true";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractErrorMeta(error: unknown) {
  const errorMeta = error as Error & { status?: number; url?: string };
  return {
    status: typeof errorMeta.status === "number" ? errorMeta.status : undefined,
    url: errorMeta.url ?? undefined,
    message: error instanceof Error ? error.message : String(error ?? ""),
  };
}

function isConfirmedAuthFailure(error: unknown) {
  const { status, message } = extractErrorMeta(error);
  if (status === 401 || status === 403) return true;

  return /(401|403|unauthorized|forbidden|invalid token|session expired|jwt)/i.test(message);
}

function debugAuthLog(message: string, payload?: Record<string, unknown>) {
  if (!shouldDebugAuthLog) return;
  if (payload) {
    console.info(`[auth] ${message}`, payload);
    return;
  }
  console.info(`[auth] ${message}`);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const userRef = useRef<AuthUser | null>(null);

  useEffect(() => {
    userRef.current = user;
    if (process.env.NODE_ENV !== "production") {
      console.info("[auth] state changed", {
        isBootstrapping,
        isAuthenticated: Boolean(user),
        userId: user?.id ?? null,
      });
    }
  }, [isBootstrapping, user]);

  const refreshUser = useCallback(async (): Promise<AuthUser | null> => {
    if (!tokenStore.hasSessionMarker()) {
      setUser(null);
      return null;
    }

    try {
      const currentUser = await authService.getCurrentUser();
      setUser(currentUser);
      return currentUser;
    } catch (error) {
      const { status, url, message } = extractErrorMeta(error);
      const reachability = await apiHealthService.checkReachability();
      const authFailureLikely = isConfirmedAuthFailure(error);

      if (authFailureLikely) {
        debugAuthLog("clearing session markers after confirmed auth failure", {
          status,
          url: url ?? null,
          reason: message,
        });
        tokenStore.clear();
        setUser(null);
        return null;
      }

      debugAuthLog("preserving session markers after non-auth refresh failure", {
        status,
        reachable: reachability.reachable,
        url: url ?? null,
        reason: message,
      });

      return userRef.current;
    }
  }, []);

  useEffect(() => {
    (async () => {
      await refreshUser();
      setIsBootstrapping(false);
    })();
  }, [refreshUser]);

  const verifySessionAfterAuth = useCallback(async (source: "login" | "signup", fallbackUser: AuthUser | null) => {
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= SESSION_VERIFY_MAX_ATTEMPTS; attempt += 1) {
      try {
        const verifiedUser = await authService.getCurrentUser();
        debugAuthLog("session verification succeeded", {
          source,
          attempt,
          userId: verifiedUser.id,
        });
        setUser(verifiedUser);
        return verifiedUser;
      } catch (error) {
        lastError = error;
        const { status, url, message } = extractErrorMeta(error);
        const authFailure = isConfirmedAuthFailure(error);

        debugAuthLog("session verification failed", {
          source,
          attempt,
          status: status ?? null,
          authFailure,
          url: url ?? null,
          reason: message,
        });

        if (attempt < SESSION_VERIFY_MAX_ATTEMPTS) {
          await sleep(SESSION_VERIFY_RETRY_DELAY_MS * attempt);
          continue;
        }

        if (authFailure) {
          debugAuthLog("session verification returned auth failure after successful auth payload; using fallback user", {
            source,
            attempt,
            status: status ?? null,
            url: url ?? null,
            reason: message,
            fallbackUserId: fallbackUser?.id ?? null,
          });
          break;
        }
      }
    }

    const { status, url, message } = extractErrorMeta(lastError);
    debugAuthLog("using login payload user after non-auth verification failure", {
      source,
      status: status ?? null,
      url: url ?? null,
      reason: message,
      fallbackUserId: fallbackUser?.id ?? null,
    });
    if (!fallbackUser) {
      tokenStore.clear();
      setUser(null);
      throw new Error("Signed in successfully, but we could not load your profile yet. Please try again.");
    }

    setUser(fallbackUser);
    return fallbackUser;
  }, []);

  const login = useCallback(async (input: LoginInput) => {
    const result = await authService.login(input);

    debugAuthLog("login payload received", {
      hasUser: Boolean(result.user),
      userId: result.user?.id ?? null,
      email: result.user?.email ?? null,
    });

    return verifySessionAfterAuth("login", result.user);
  }, [verifySessionAfterAuth]);

  const signup = useCallback(async (input: SignupInput) => {
    const result = await authService.signup(input);

    debugAuthLog("signup payload received", {
      hasUser: Boolean(result.user),
      userId: result.user?.id ?? null,
      email: result.user?.email ?? null,
    });

    return verifySessionAfterAuth("signup", result.user);
  }, [verifySessionAfterAuth]);

  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } finally {
      tokenStore.clear();
      setUser(null);
    }
  }, []);

  const forgotPassword = useCallback((email: string) => {
    return authService.forgotPassword(email);
  }, []);

  const resetPassword = useCallback((input: { token: string; password: string }) => {
    return authService.resetPassword(input);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      isBootstrapping,
      login,
      signup,
      logout,
      refreshUser,
      forgotPassword,
      resetPassword,
    }),
    [user, isBootstrapping, login, signup, logout, refreshUser, forgotPassword, resetPassword],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuthContext must be used within AuthProvider");
  }

  return context;
}
