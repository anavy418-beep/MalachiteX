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
      const errorMeta = error as Error & { status?: number; url?: string };
      const status = typeof errorMeta.status === "number" ? errorMeta.status : undefined;
      const reachability = await apiHealthService.checkReachability();
      const authFailureLikely =
        status === 401 ||
        status === 403 ||
        (
          error instanceof Error &&
          /(401|403|unauthorized|forbidden|invalid|session|token|jwt)/i.test(error.message)
        );

      if (authFailureLikely) {
        if (process.env.NODE_ENV !== "production") {
          console.warn("[auth] clearing session markers after confirmed auth failure", {
            status,
            url: errorMeta.url ?? null,
            reason: error instanceof Error ? error.message : String(error ?? ""),
          });
        }
        tokenStore.clear();
        setUser(null);
        return null;
      }

      if (process.env.NODE_ENV !== "production") {
        console.warn("[auth] preserving session markers after non-auth refresh failure", {
          status,
          reachable: reachability.reachable,
          url: errorMeta.url ?? null,
          reason: error instanceof Error ? error.message : String(error ?? ""),
        });
      }

      return userRef.current;
    }
  }, []);

  useEffect(() => {
    (async () => {
      await refreshUser();
      setIsBootstrapping(false);
    })();
  }, [refreshUser]);

  const login = useCallback(async (input: LoginInput) => {
    const result = await authService.login(input);
    try {
      const verifiedUser = await authService.getCurrentUser();
      setUser(verifiedUser);
      return verifiedUser;
    } catch (error) {
      const status = (error as Error & { status?: number }).status;
      if (status === 401 || status === 403) {
        tokenStore.clear();
        setUser(null);
        throw new Error("Session could not be established. Please sign in again.");
      }

      setUser(result.user);
      return result.user;
    }
  }, []);

  const signup = useCallback(async (input: SignupInput) => {
    const result = await authService.signup(input);
    try {
      const verifiedUser = await authService.getCurrentUser();
      setUser(verifiedUser);
      return verifiedUser;
    } catch (error) {
      const status = (error as Error & { status?: number }).status;
      if (status === 401 || status === 403) {
        tokenStore.clear();
        setUser(null);
        throw new Error("Session could not be established. Please sign in again.");
      }

      setUser(result.user);
      return result.user;
    }
  }, []);

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
