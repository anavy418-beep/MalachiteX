import type { InputHTMLAttributes } from "react";

export function TextField({ label, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="font-medium text-slate-700">{label}</span>
      <input
        {...props}
        className="h-10 rounded-md border border-slate-300 px-3 text-sm outline-none ring-brand-500 transition focus:ring-2"
      />
    </label>
  );
}
