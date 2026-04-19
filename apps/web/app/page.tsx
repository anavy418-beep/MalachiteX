import Link from "next/link";
import { ArrowRight, LockKeyhole, ShieldCheck, WalletCards } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const demoMarketRows = [
  { pair: "USDT/INR", price: "INR 83.21", change: "+1.24%" },
  { pair: "BTC/USDT", price: "$68,420", change: "+0.68%" },
  { pair: "ETH/USDT", price: "$3,550", change: "+1.02%" },
  { pair: "SOL/USDT", price: "$158.77", change: "-0.41%" },
];

export default function HomePage() {
  return (
    <div className="space-y-10">
      <section className="grid items-center gap-6 rounded-3xl border border-emerald-900/40 bg-gradient-to-br from-zinc-900/90 via-zinc-900 to-emerald-950/30 p-6 md:p-10 lg:grid-cols-[1.2fr_0.8fr]">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full border border-emerald-700/40 bg-emerald-950/40 px-3 py-1 text-xs tracking-[0.14em] text-emerald-200">
            <ShieldCheck className="h-3.5 w-3.5" />
            MALACHITEX
          </p>
          <h1 className="mt-5 text-4xl font-semibold leading-tight text-white md:text-5xl">
            Premium crypto wallet and fast P2P trading, designed for modern operators.
          </h1>
          <p className="mt-4 max-w-2xl text-sm text-slate-300 md:text-base">
            Malachitex is a demo-ready platform for secure account access, wallet visibility, and
            rapid P2P trade workflows with exchange-grade UX.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/signup">
              <Button size="lg" className="gap-2">
                Sign Up
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/dashboard">
              <Button variant="outline" size="lg">
                Open Dashboard
              </Button>
            </Link>
          </div>
        </div>

        <Card className="border-emerald-900/40 bg-zinc-950/70">
          <CardHeader>
            <CardTitle className="text-lg">Market Snapshot</CardTitle>
            <CardDescription>Demo market data for staging and UI previews</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {demoMarketRows.map((row) => (
              <div
                key={row.pair}
                className="grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2"
              >
                <p className="text-sm text-slate-200">{row.pair}</p>
                <p className="text-sm font-medium text-white">{row.price}</p>
                <p className={`text-xs ${row.change.startsWith("-") ? "text-red-300" : "text-emerald-300"}`}>
                  {row.change}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <p className="text-2xl font-semibold text-emerald-300">150K+</p>
            <p className="mt-1 text-xs uppercase tracking-wide text-slate-400">Wallet Transactions (Demo)</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-2xl font-semibold text-emerald-300">99.9%</p>
            <p className="mt-1 text-xs uppercase tracking-wide text-slate-400">Uptime Target For Staging</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-2xl font-semibold text-emerald-300">&lt;300ms</p>
            <p className="mt-1 text-xs uppercase tracking-wide text-slate-400">Typical API Response Goal</p>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <WalletCards className="h-5 w-5 text-emerald-300" />
              Wallet Visibility
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-300">
              Track available and locked funds with clean dashboards and ledger-first accounting views.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <LockKeyhole className="h-5 w-5 text-emerald-300" />
              Session Security
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-300">
              JWT access + refresh workflow with role-ready architecture for future operational controls.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ShieldCheck className="h-5 w-5 text-emerald-300" />
              P2P Ready UX
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-300">
              Staging-ready shell for offers, trades, chat, and dispute workflows with premium styling.
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
