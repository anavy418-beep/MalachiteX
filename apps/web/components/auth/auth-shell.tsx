import Image from "next/image";
import type { ReactNode } from "react";
import { ShieldCheck } from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="relative isolate mx-auto grid w-full max-w-5xl items-center gap-8 py-10 md:grid-cols-[1.1fr_1fr]">
      <section className="hidden rounded-2xl border border-emerald-900/30 bg-zinc-900/60 p-8 text-slate-200 md:block">
        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-800/50 bg-emerald-950/40 px-3 py-1 text-xs text-emerald-200">
          <span className="relative h-4 w-14 shrink-0">
            <Image
              src="/brand/malachite-logo.png"
              alt="Xorviqa logo"
              fill
              sizes="56px"
              className="object-contain object-left"
            />
          </span>
          <ShieldCheck className="h-4 w-4" />
          Xorviqa Secure Access
        </div>
        <h2 className="mt-6 text-3xl font-semibold leading-tight text-white">
          Trade and manage digital assets with a premium wallet and P2P experience.
        </h2>
        <p className="mt-4 text-sm text-slate-400">
          Sign in to your Xorviqa workspace to monitor balances, activity, and P2P operations.
        </p>
        <p className="mt-2 text-xs uppercase tracking-[0.18em] text-emerald-300/85">
          Trade Without Borders
        </p>
        <div className="mt-8 grid gap-3 text-sm text-slate-300">
          <p>- Demo-ready wallet and portfolio views</p>
          <p>- P2P-ready trading dashboard shell</p>
          <p>- Secure JWT session workflow</p>
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{subtitle}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {children}
          {footer ? <div className="border-t border-slate-800 pt-4 text-sm text-slate-400">{footer}</div> : null}
        </CardContent>
      </Card>

      <p className="md:col-span-2 text-center text-xs text-slate-500">
        By continuing, you agree to Xorviqa platform terms and responsible trading conduct.
        <Link className="ml-1 text-emerald-300 hover:text-emerald-200" href="/">
          Learn more
        </Link>
      </p>
    </div>
  );
}
