import { useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";

export function useAuthState() {
  const { isAuthenticated, user } = useAuth();

  return useMemo(
    () => ({
      isAuthenticated,
      accessToken: user ? "__cookie_session__" : null,
    }),
    [isAuthenticated, user],
  );
}
