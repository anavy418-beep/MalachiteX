"use client";

import type { ReactNode } from "react";
import { Toaster } from "sonner";
import { AuthProvider } from "@/store/auth-context";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      {children}
      <Toaster richColors theme="dark" position="top-right" />
    </AuthProvider>
  );
}
