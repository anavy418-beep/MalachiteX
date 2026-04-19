"use client";

import { tokenStore } from "@/lib/api";

export function AuthGuardNote() {
  if (!tokenStore.accessToken) {
    return (
      <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
        You are browsing as guest. Login to execute authenticated actions.
      </div>
    );
  }

  return null;
}
