import { useMemo } from "react";
import { tokenStore } from "@/lib/api";

export function useAuthState() {
  return useMemo(
    () => ({
      isAuthenticated: Boolean(tokenStore.accessToken),
      accessToken: tokenStore.accessToken,
    }),
    [],
  );
}
