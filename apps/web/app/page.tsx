import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Bot,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  WalletCards,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const marketRows = [
  { pair: "BTC/USDT", price: "$68,420.10", change: "+0.68%" },
  { pair: "ETH/USDT", price: "$3,550.40", change: "+1.02%" },
  { pair: "SOL/USDT", price: "$158.77", change: "-0.41%" },
];

const features = [
  {
    icon: WalletCards,
    title: "Custodial Wallet MVP",
    body: "Wallet identity, QR deposits, withdrawals, balances, and ledger-style history for a believable fintech demo.",
  },
  {
    icon: ShieldCheck,
    title: "Escrow-Based P2P",
    body: "Offers, trade lifecycle, payment instructions, proof capture, chat, notifications, and dispute handling.",
  },
  {
    icon: BarChart3,
    title: "Markets + Paper Trading",
    body: "Live Binance-powered market views, charts, and simulated broker-style demo trading with long and short positions.",
  },
];

const workflow = [
  "Create or browse a P2P offer",
  "Escrow locks seller funds",
  "Buyer uploads payment proof",
  "Seller releases crypto after verification",
];

export default function HomePage() {
  return (
    <div className="space-y-12">
      <section className="relative overflow-hidden rounded-3xl border border-emerald-900/40 bg-gradient-to-br from-zinc-900/95 via-zinc-950 to-emerald-950/40 p-6 shadow-2xl shadow-emerald-950/20 md:p-10">
        <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-40 w-40 rounded-full bg-lime-400/10 blur-3xl" />

        <div className="relative grid items-center gap-8 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="animate-rise-in">
            <p className="inline-flex items-center gap-2 rounded-full border border-emerald-700/40 bg-emerald-950/50 px-3 py-1 text-xs tracking-[0.14em] text-emerald-200">
              <BadgeCheck className="h-3.5 w-3.5" />
              PUBLIC DEMO READY
            </p>
            <h1 className="mt-5 max-w-4xl text-4xl font-semibold leading-tight text-white md:text-6xl">
              A premium crypto wallet, P2P escrow, and paper trading demo in one product.
            </h1>
            <p className="mt-5 max-w-2xl text-sm leading-6 text-slate-300 md:text-base">
              MalachiteX is a portfolio-grade fintech MVP that shows secure auth, custodial wallet flows,
              P2P payment proof, real-time markets, and simulated trading without real-money brokerage execution.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/login?demo=1&next=/dashboard" prefetch={false}>
                <Button size="lg" className="w-full gap-2 sm:w-auto">
                  <Sparkles className="h-4 w-4" />
                  Try Demo
                </Button>
              </Link>
              <Link href="/p2p" prefetch={false}>
                <Button variant="outline" size="lg" className="w-full gap-2 sm:w-auto">
                  Explore P2P
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="/markets" prefetch={false}>
                <Button variant="ghost" size="lg" className="w-full sm:w-auto">
                  View Markets
                </Button>
              </Link>
            </div>

            <div className="mt-7 grid gap-3 text-xs text-slate-400 sm:grid-cols-3">
              <p className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-3">
                Demo-safe: no real payment gateway or brokerage routing.
              </p>
              <p className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-3">
                Cookie-based auth and role-aware trade actions.
              </p>
              <p className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-3">
                Built for walkthroughs, recruiters, and investor-style demos.
              </p>
            </div>
          </div>

          <div className="animate-rise-in animation-delay-100 space-y-4">
            <Card className="animate-soft-float border-emerald-800/40 bg-zinc-950/75">
              <CardHeader>
                <CardTitle className="text-lg">Live Product Preview</CardTitle>
                <CardDescription>P2P desk, escrow status, and market data in one cockpit.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-2xl border border-zinc-800 bg-gradient-to-br from-emerald-950/40 to-zinc-950 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-500">Active trade</p>
                      <p className="mt-1 text-lg font-semibold text-white">USDT/INR escrow</p>
                      <p className="text-xs text-slate-400">Payment proof received. Awaiting seller release.</p>
                    </div>
                    <span className="rounded-full border border-lime-700/50 bg-lime-950/40 px-2 py-1 text-xs text-lime-200">
                      PAYMENT SENT
                    </span>
                  </div>
                  <div className="mt-4 grid gap-2 sm:grid-cols-3">
                    {["Wallet", "P2P", "Dispute"].map((item) => (
                      <div key={item} className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3">
                        <p className="text-xs text-slate-500">{item}</p>
                        <p className="text-sm font-medium text-emerald-200">Ready</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid gap-2">
                  {marketRows.map((row) => (
                    <div
                      key={row.pair}
                      className="grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-2"
                    >
                      <p className="text-sm text-slate-200">{row.pair}</p>
                      <p className="text-sm font-medium text-white">{row.price}</p>
                      <p className={`text-xs ${row.change.startsWith("-") ? "text-red-300" : "text-emerald-300"}`}>
                        {row.change}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {features.map((feature, index) => {
          const Icon = feature.icon;
          return (
            <Card key={feature.title} className={`animate-rise-in animation-delay-${index === 0 ? "100" : "200"}`}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Icon className="h-5 w-5 text-emerald-300" />
                  {feature.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-6 text-slate-300">{feature.body}</p>
              </CardContent>
            </Card>
          );
        })}
      </section>

      <section className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
        <Card className="border-emerald-900/40 bg-emerald-950/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <MessageSquare className="h-5 w-5 text-emerald-300" />
              P2P Payment Flow
            </CardTitle>
            <CardDescription>Clear, demo-safe escrow workflow for public walkthroughs.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {workflow.map((step, index) => (
              <div key={step} className="flex gap-3 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-emerald-600 text-xs font-semibold text-white">
                  {index + 1}
                </span>
                <p className="text-sm text-slate-300">{step}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Bot className="h-5 w-5 text-emerald-300" />
              Portfolio Talking Points
            </CardTitle>
            <CardDescription>What this demo is designed to show quickly.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {[
              "Production-minded auth with httpOnly cookies",
              "Thin controllers and service-layer business rules",
              "Ledger-first wallet accounting patterns",
              "Escrow state safety and participant permissions",
              "Real-time market data with resilient fallbacks",
              "Friendly UX for loading, errors, proofs, and disputes",
            ].map((item) => (
              <div key={item} className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 text-sm text-slate-300">
                {item}
              </div>
            ))}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

