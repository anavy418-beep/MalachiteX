"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-lg border border-transparent text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 disabled:pointer-events-none disabled:opacity-60",
  {
    variants: {
      variant: {
        default:
          "bg-emerald-600 text-white shadow-[0_8px_18px_-10px_rgba(16,185,129,0.9)] hover:bg-emerald-500 hover:shadow-[0_12px_24px_-12px_rgba(16,185,129,0.95)]",
        secondary: "border-zinc-700 bg-zinc-800 text-slate-100 hover:bg-zinc-700 hover:border-zinc-600",
        outline: "border-zinc-700 bg-zinc-900/60 text-slate-100 hover:bg-zinc-800 hover:border-zinc-600",
        ghost: "text-slate-200 hover:bg-zinc-800 hover:border-zinc-700",
        danger:
          "bg-red-600 text-white shadow-[0_8px_18px_-10px_rgba(220,38,38,0.85)] hover:bg-red-500 hover:shadow-[0_12px_24px_-12px_rgba(220,38,38,0.9)]",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 px-3",
        lg: "h-11 px-6",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
