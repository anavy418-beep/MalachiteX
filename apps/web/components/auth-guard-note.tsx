"use client";

import { useAuth } from "@/hooks/use-auth";

export function AuthGuardNote() {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return (
      <div className="rounded-xl border border-amber-800/40 bg-amber-950/20 p-3 text-sm text-amber-100">
        You are browsing the public demo. Sign in or use Try Demo to run authenticated actions.
      </div>
    );
  }

  return null;
}
