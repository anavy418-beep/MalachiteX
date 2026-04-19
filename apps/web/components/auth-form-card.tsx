import type { ReactNode } from "react";

export function AuthFormCard({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <section className="mx-auto max-w-md rounded-xl border bg-white p-6 shadow-sm">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
      <div className="mt-6">{children}</div>
    </section>
  );
}
