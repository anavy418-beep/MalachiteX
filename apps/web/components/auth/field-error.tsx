import { cn } from "@/lib/utils";

export function FieldError({ message, className }: { message?: string; className?: string }) {
  if (!message) {
    return null;
  }

  return <p className={cn("text-xs text-red-400", className)}>{message}</p>;
}
