import * as React from "react";
import { cn } from "../lib/utils";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "outline" | "ghost";
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-700 disabled:pointer-events-none disabled:opacity-60",
          variant === "default" && "bg-slate-900 text-white hover:bg-slate-800",
          variant === "outline" && "border border-slate-300 bg-white hover:bg-slate-50",
          variant === "ghost" && "hover:bg-slate-100",
          className,
        )}
        {...props}
      />
    );
  },
);

Button.displayName = "Button";
