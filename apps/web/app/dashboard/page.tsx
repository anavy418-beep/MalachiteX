"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  BellRing,
  Clock3,
  LayoutDashboard,
  ListChecks,
  ShieldCheck,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { formatMinorUnits } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface DashboardPayload {
  wallet: {
    availableBalanceMinor: string;
    escrowBalanceMinor: string;
    currency: string;
  };
  openTrades: number;
  activeOffers: number;
  unreadNotifications: number;
}

const DEMO_DASHBOARD_DATA: DashboardPayload = {
  wallet: {
    availableBalanceMinor: "2450000",
    escrowBalanceMinor: "375000",
    currency: "INR",
  },
  openTrades: 3,
  activeOffers: 2,
  unreadNotifications: 4,
};

// TODO(step-8): Replace with dedicated activity endpoint.
const DEMO_ACTIVITY = [
  { id: "a1", title: "Escrow funded for trade #TRD-2045", at: "6 mins ago", tone: "text-emerald-300" },
  { id: "a2", title: "Withdrawal request queued", at: "45 mins ago", tone: "text-green-300" },
  { id: "a3", title: "Offer repriced in P2P market", at: "2 hrs ago", tone: "text-lime-300" },
];

// TODO(step-8): Replace with notifications preview endpoint.
const DEMO_NOTIFICATIONS = [
  { id: "n1", message: "Buyer marked payment completed.", at: "Just now" },
  { id: "n2", message: "Security reminder: rotate password regularly.", at: "Today" },
  { id: "n3", message: "Staging maintenance at 02:00 UTC.", at: "Today" },
];

export default function DashboardPage() {
  const { user, isAuthenticated, isBootstrapping } = useAuth();
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDemo, setIsDemo] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const payload = await apiRequest<DashboardPayload>("/users/dashboard");
        setData(payload);
      } catch (err) {
        setData(DEMO_DASHBOARD_DATA);
        setIsDemo(true);
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const current = data ?? DEMO_DASHBOARD_DATA;
  const available = BigInt(current.wallet.availableBalanceMinor || "0");
  const locked = BigInt(current.wallet.escrowBalanceMinor || "0");
  const total = available + locked;

  const lockedRatio = useMemo(() => {
    if (total <= 0n) return 0;
    return Math.max(0, Math.min(100, Math.round((Number(locked) / Number(total)) * 100)));
  }, [locked, total]);

  if (isBootstrapping) {
    return <p className="text-sm text-slate-400">Loading dashboard...</p>;
  }

  if (!isAuthenticated) {
    return (
      <section className="space-y-3">
        <h1 className="text-2xl font-semibold text-white">Dashboard</h1>
        <p className="text-sm text-slate-400">Your session is not active. Please log in again.</p>
        <Link href="/login">
          <Button>Go to login</Button>
        </Link>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.2em] text-emerald-300">Malachitex Console</p>
        <h1 className="text-3xl font-semibold text-white">Dashboard</h1>
        <p className="text-sm text-slate-400">Portfolio health, wallet movement, and trade signals in one view.</p>
      </header>

      {error ? (
        <Card className="border-amber-500/30 bg-amber-950/20">
          <CardContent className="pt-6">
            <p className="text-sm text-amber-200">
              Live dashboard data is unavailable, showing safe demo data for preview.
            </p>
            <p className="mt-1 text-xs text-amber-300/80">{error}</p>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        <aside>
          <Card className="sticky top-24 hidden lg:block">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Workspace</CardTitle>
              <CardDescription>Navigate your operator console</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Link href="/dashboard" className="flex items-center gap-2 rounded-md bg-emerald-950/70 px-3 py-2 text-sm text-emerald-200">
                <LayoutDashboard className="h-4 w-4" />
                Overview
              </Link>
              <Link href="/wallet" className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-300 hover:bg-zinc-800">
                <Wallet className="h-4 w-4 text-slate-400" />
                Wallet
              </Link>
              <Link href="/offers" className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-300 hover:bg-zinc-800">
                <TrendingUp className="h-4 w-4 text-slate-400" />
                P2P Market
              </Link>
              <Link href="/wallet/history" className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-300 hover:bg-zinc-800">
                <ListChecks className="h-4 w-4 text-slate-400" />
                Activity
              </Link>
            </CardContent>
          </Card>
        </aside>

        <div className="space-y-6">
          <Card className="overflow-hidden border-emerald-900/60 bg-gradient-to-br from-emerald-950/60 via-zinc-900 to-zinc-900">
            <CardContent className="relative pt-6">
              <div className="absolute -right-16 -top-16 h-40 w-40 rounded-full bg-emerald-500/20 blur-3xl" />
              <p className="text-xs uppercase tracking-[0.2em] text-emerald-200/90">Welcome back</p>
              <h2 className="mt-2 text-2xl font-semibold text-white">{user?.username ?? "Trader"}</h2>
              <p className="mt-1 text-sm text-slate-300">{user?.email}</p>
              <div className="mt-5 flex flex-wrap items-center gap-3 text-xs text-slate-300">
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-300" />
                  Secure session active
                </span>
                {isDemo ? (
                  <span className="inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-amber-200">
                    Demo data mode
                  </span>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total Portfolio</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-xl font-semibold text-white">
                  {formatMinorUnits(total.toString(), current.wallet.currency)}
                </p>
                <p className="mt-1 text-xs text-slate-400">Available + locked funds</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Open Trades</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-xl font-semibold text-white">{current.openTrades}</p>
                <p className="mt-1 text-xs text-slate-400">In active lifecycle</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Active Offers</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-xl font-semibold text-white">{current.activeOffers}</p>
                <p className="mt-1 text-xs text-slate-400">Visible in market</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Unread Alerts</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-xl font-semibold text-white">{current.unreadNotifications}</p>
                <p className="mt-1 text-xs text-slate-400">Notifications pending</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-5">
            <Card className="lg:col-span-3">
              <CardHeader>
                <CardTitle className="text-lg">Wallet Preview</CardTitle>
                <CardDescription>Live account snapshot before opening wallet module</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4">
                    <p className="text-xs uppercase tracking-wider text-slate-400">Available</p>
                    <p className="mt-2 text-xl font-semibold text-emerald-300">
                      {formatMinorUnits(available.toString(), current.wallet.currency)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4">
                    <p className="text-xs uppercase tracking-wider text-slate-400">Locked In Escrow</p>
                    <p className="mt-2 text-xl font-semibold text-lime-300">
                      {formatMinorUnits(locked.toString(), current.wallet.currency)}
                    </p>
                  </div>
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between text-xs text-slate-400">
                    <span>Escrow utilization</span>
                    <span>{lockedRatio}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-zinc-800">
                    <div className="h-2 rounded-full bg-gradient-to-r from-emerald-500 to-lime-400" style={{ width: `${lockedRatio}%` }} />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-lg">Quick Actions</CardTitle>
                <CardDescription>High-frequency operations</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-2">
                <Link href="/wallet/deposit">
                  <Button className="w-full justify-start gap-2">
                    <ArrowDownToLine className="h-4 w-4" />
                    Deposit
                  </Button>
                </Link>
                <Link href="/wallet/withdraw">
                  <Button variant="secondary" className="w-full justify-start gap-2">
                    <ArrowUpFromLine className="h-4 w-4" />
                    Withdraw
                  </Button>
                </Link>
                <Link href="/offers">
                  <Button variant="outline" className="w-full justify-start gap-2">
                    <TrendingUp className="h-4 w-4" />
                    P2P Market
                  </Button>
                </Link>
                <Link href="/trades">
                  <Button variant="outline" className="w-full justify-start gap-2">
                    <ListChecks className="h-4 w-4" />
                    My Trades
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Recent Activity</CardTitle>
                <CardDescription>Account and trade timeline</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {DEMO_ACTIVITY.map((activity) => (
                  <div key={activity.id} className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
                    <p className={`text-sm font-medium ${activity.tone}`}>{activity.title}</p>
                    <p className="mt-1 flex items-center gap-1 text-xs text-slate-400">
                      <Clock3 className="h-3.5 w-3.5" />
                      {activity.at}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Notifications</CardTitle>
                <CardDescription>Unread preview panel</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {DEMO_NOTIFICATIONS.map((item) => (
                  <div key={item.id} className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
                    <p className="flex items-start gap-2 text-sm text-slate-200">
                      <BellRing className="mt-0.5 h-4 w-4 text-emerald-300" />
                      <span>{item.message}</span>
                    </p>
                    <p className="mt-1 text-xs text-slate-500">{item.at}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {loading ? <p className="text-xs text-slate-500">Refreshing dashboard data...</p> : null}
        </div>
      </div>
    </section>
  );
}
