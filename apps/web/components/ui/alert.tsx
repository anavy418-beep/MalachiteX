import * as React from "react";
import { cn } from "@/lib/utils";

export function Alert({
  className,
  variant = "info",
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { variant?: "info" | "success" | "error" }) {
  return (
    <div
      role="alert"
      className={cn(
        "rounded-md border px-3 py-2 text-sm",
        variant === "info" && "border-emerald-700/60 bg-emerald-950/40 text-emerald-200",
        variant === "success" && "border-emerald-700/60 bg-emerald-950/40 text-emerald-200",
        variant === "error" && "border-red-700/60 bg-red-950/40 text-red-200",
        className,
      )}
      {...props}
    />
  );
}
