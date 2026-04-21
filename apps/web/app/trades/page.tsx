"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRightLeft, ListChecks, Search, ShieldCheck } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { tokenStore } from "@/lib/api";
import { formatDateTime, formatMinorUnits } from "@/lib/money";
import { tradesService, type TradeRecord } from "@/services/trades.service";
import { walletService, type WalletSummary } from "@/services/wallet.service";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingState } from "@/components/ui/loading-state";

type TradeDashboardTab = "ALL" | "OPEN" | "COMPLETED" | "CANCELLED" | "DISPUTED";
type TradeDirection = "BUY" | "SELL";
type DashboardStatus = "OPEN" | "PAID" | "RELEASED" | "COMPLETED" | "CANCELLED" | "DISPUTED";

const PAGE_SIZE = 8;
const QUICK_PAIRS = ["BTC/USDT", "ETH/USDT", "SOL/USDT", "XRP/USDT"];

function toDashboardStatus(status: string): DashboardStatus {
  const normalized = status.toUpperCase();
  if (normalized === "OPEN" || normalized === "PAYMENT_PENDING" || normalized === "PENDING_PAYMENT") {
    return "OPEN";
  }
  if (normalized === "PAYMENT_SENT" || normalized === "PAID") {
    return "PAID";
  }
  if (normalized === "RELEASE_PENDING" || normalized === "RELEASED") {
    return "RELEASED";
  }
  if (normalized === "COMPLETED") {
    return "COMPLETED";
  }
  if (normalized === "CANCELLED" || normalized === "CANCELED") {
    return "CANCELLED";
  }
  if (normalized === "DISPUTED") {
    return "DISPUTED";
  }
  return "OPEN";
}

function isOpenLifecycle(status: DashboardStatus) {
  return status === "OPEN" || status === "PAID" || status === "RELEASED";
}

function parseTradeTimestamp(trade: TradeRecord) {
  const value = trade.createdAt ?? trade.openedAt ?? "";
  const parsed = value ? new Date(value).getTime() : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

function toTradePair(trade: TradeRecord) {
  const asset = trade.offer?.asset ?? "USDT";
  const fiat = trade.offer?.fiatCurrency ?? "INR";
  return `${asset}/${fiat}`;
}

function toTradeDirection(trade: TradeRecord, currentUserId: string): TradeDirection {
  return trade.buyerId === currentUserId ? "BUY" : "SELL";
}

function toCounterpartyLabel(trade: TradeRecord, currentUserId: string) {
  const isBuyer = trade.buyerId === currentUserId;
  const counterparty = isBuyer ? trade.seller : trade.buyer;
  const counterpartyId = isBuyer ? trade.sellerId : trade.buyerId;
  if (counterparty?.username) {
    return counterparty.username;
  }
  return `User ${counterpartyId.slice(0, 8)}`;
}

function statusBadgeTone(status: DashboardStatus) {
  if (status === "COMPLETED" || status === "RELEASED") {
    return "border-emerald-700/40 bg-emerald-950/30 text-emerald-200";
  }
  if (status === "PAID" || status === "OPEN") {
    return "border-amber-700/40 bg-amber-950/30 text-amber-200";
  }
  if (status === "CANCELLED") {
    return "border-red-700/40 bg-red-950/30 text-red-200";
  }
  if (status === "DISPUTED") {
    return "border-orange-700/40 bg-orange-950/30 text-orange-200";
  }
  return "border-zinc-700 bg-zinc-900 text-slate-200";
}

function directionTone(direction: TradeDirection) {
  return direction === "BUY"
    ? "border-emerald-700/40 bg-emerald-950/20 text-emerald-200"
    : "border-red-700/40 bg-red-950/20 text-red-200";
}

function safeBigInt(value: string | bigint | number | null | undefined) {
  try {
    return BigInt(String(value ?? "0"));
  } catch {
    return 0n;
  }
}

export default function TradesPage() {
  const { user, isAuthenticated, isBootstrapping } = useAuth();
  const hasSessionMarker = tokenStore.hasSessionMarker();
  const isSessionResolved = !isBootstrapping;
  const hasAuthenticatedUser = isAuthenticated && Boolean(user);
  const shouldShowGuestScreen = isSessionResolved && !hasAuthenticatedUser && !hasSessionMarker;
  const shouldHoldDashboardShell = !shouldShowGuestScreen && !hasAuthenticatedUser;

  const [trades, setTrades] = useState<TradeRecord[]>([]);
  const [wallet, setWallet] = useState<WalletSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TradeDashboardTab>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [pairFilter, setPairFilter] = useState("ALL");
  const [currentPage, setCurrentPage] = useState(1);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [quickSide, setQuickSide] = useState<TradeDirection>("BUY");
  const [quickPair, setQuickPair] = useState(QUICK_PAIRS[0]);

  useEffect(() => {
    if (isBootstrapping) {
      return;
    }

    if (!hasAuthenticatedUser) {
      setTrades([]);
      setWallet(null);
      setError(null);
      setLoading(false);
      return;
    }

    let active = true;

    const loadDashboard = async () => {
      setLoading(true);
      setError(null);

      const token = tokenStore.accessToken;
      if (!token) {
        if (active) {
          setTrades([]);
          setWallet(null);
          setLoading(false);
          setError("Session expired. Please sign in again.");
        }
        return;
      }

      try {
        const [tradePayload, walletPayload] = await Promise.all([
          tradesService.listMine(token),
          walletService.getWallet(token).catch(() => null),
        ]);

        if (!active) return;

        setTrades(tradePayload);
        setWallet(walletPayload);
      } catch (err) {
        if (!active) return;
        setTrades([]);
        setWallet(null);
        setError((err as Error).message || "Unable to load trade dashboard.");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void loadDashboard();

    return () => {
      active = false;
    };
  }, [hasAuthenticatedUser, isBootstrapping, refreshNonce]);

  const pairOptions = useMemo(() => {
    const pairs = new Set<string>(QUICK_PAIRS);
    trades.forEach((trade) => {
      pairs.add(toTradePair(trade));
    });
    return [...pairs];
  }, [trades]);

  useEffect(() => {
    if (pairOptions.includes(quickPair)) {
      return;
    }
    setQuickPair(pairOptions[0] ?? QUICK_PAIRS[0]);
  }, [pairOptions, quickPair]);

  const summary = useMemo(() => {
    let completedTrades = 0;
    let openTrades = 0;
    let cancelledTrades = 0;
    let disputedTrades = 0;
    let totalVolumeMinor = 0n;
    let volumeCurrency = "INR";

    trades.forEach((trade) => {
      const dashboardStatus = toDashboardStatus(trade.status);
      totalVolumeMinor += safeBigInt(trade.fiatTotalMinor);
      volumeCurrency = trade.offer?.fiatCurrency ?? volumeCurrency;

      if (dashboardStatus === "COMPLETED") completedTrades += 1;
      if (dashboardStatus === "CANCELLED") cancelledTrades += 1;
      if (dashboardStatus === "DISPUTED") disputedTrades += 1;
      if (isOpenLifecycle(dashboardStatus)) openTrades += 1;
    });

    return {
      totalTrades: trades.length,
      completedTrades,
      openTrades,
      cancelledTrades,
      disputedTrades,
      totalVolume: formatMinorUnits(totalVolumeMinor, volumeCurrency),
    };
  }, [trades]);

  const tabCounts = useMemo(
    () => ({
      ALL: summary.totalTrades,
      OPEN: summary.openTrades,
      COMPLETED: summary.completedTrades,
      CANCELLED: summary.cancelledTrades,
      DISPUTED: summary.disputedTrades,
    }),
    [summary],
  );

  const filteredTrades = useMemo(() => {
    if (!user) return [] as TradeRecord[];

    const loweredSearch = searchQuery.trim().toLowerCase();

    return [...trades]
      .sort((left, right) => parseTradeTimestamp(right) - parseTradeTimestamp(left))
      .filter((trade) => {
        const dashboardStatus = toDashboardStatus(trade.status);
        if (activeTab === "OPEN" && !isOpenLifecycle(dashboardStatus)) return false;
        if (activeTab === "COMPLETED" && dashboardStatus !== "COMPLETED") return false;
        if (activeTab === "CANCELLED" && dashboardStatus !== "CANCELLED") return false;
        if (activeTab === "DISPUTED" && dashboardStatus !== "DISPUTED") return false;

        const pair = toTradePair(trade);
        if (pairFilter !== "ALL" && pair !== pairFilter) return false;

        if (!loweredSearch) return true;

        const direction = toTradeDirection(trade, user.id);
        const counterparty = toCounterpartyLabel(trade, user.id);

        const haystack = [
          trade.id,
          pair,
          direction,
          counterparty,
          dashboardStatus,
          trade.offer?.paymentMethod ?? "",
        ]
          .join(" ")
          .toLowerCase();

        return haystack.includes(loweredSearch);
      });
  }, [activeTab, pairFilter, searchQuery, trades, user]);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, pairFilter, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredTrades.length / PAGE_SIZE));
  const paginatedTrades = useMemo(() => {
    const offset = (currentPage - 1) * PAGE_SIZE;
    return filteredTrades.slice(offset, offset + PAGE_SIZE);
  }, [currentPage, filteredTrades]);

  useEffect(() => {
    if (currentPage <= totalPages) return;
    setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  if (isBootstrapping || shouldHoldDashboardShell) {
    return <LoadingState label="Loading trade dashboard" />;
  }

  if (shouldShowGuestScreen) {
    return (
      <section className="space-y-6">
        <header className="space-y-2">
          <p className="text-xs uppercase tracking-[0.2em] text-emerald-300">Trades</p>
          <h1 className="text-3xl font-semibold text-white">P2P Trade Dashboard</h1>
          <p className="text-sm text-slate-400">Sign in to view your open trades, completed history, and lifecycle updates.</p>
        </header>

        <Card className="border-zinc-800 bg-zinc-950/60">
          <CardContent className="space-y-4 pt-6">
            <p className="text-sm text-slate-300">No active session found for this trade workspace.</p>
            <div className="flex flex-wrap gap-3">
              <Link href="/login">
                <Button>Log in</Button>
              </Link>
              <Link href="/signup">
                <Button variant="outline">Create account</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </section>
    );
  }

  if (!user) {
    return <LoadingState label="Loading trade dashboard" />;
  }

  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-emerald-300">Trades</p>
            <h1 className="text-3xl font-semibold text-white">My Trade Dashboard</h1>
            <p className="text-sm text-slate-400">
              Live lifecycle board for your P2P activity, open orders, and settlement outcomes.
            </p>
          </div>
          <Button variant="outline" onClick={() => setRefreshNonce((current) => current + 1)}>
            Refresh
          </Button>
        </div>
      </header>

      {error ? (
        <Card className="border-red-700/30 bg-red-950/20">
          <CardContent className="pt-6">
            <p className="text-sm text-red-200">{error}</p>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard title="Total Trades" value={String(summary.totalTrades)} accent="text-white" />
          <SummaryCard title="Completed Trades" value={String(summary.completedTrades)} accent="text-emerald-300" />
          <SummaryCard title="Open Trades" value={String(summary.openTrades)} accent="text-amber-300" />
          <SummaryCard title="Total Volume" value={summary.totalVolume} accent="text-slate-100" />
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Quick Trade Panel</CardTitle>
              <CardDescription>Choose direction and pair, then jump straight into the market.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="inline-flex w-full rounded-xl border border-zinc-700 bg-zinc-950/70 p-1">
                <button
                  onClick={() => setQuickSide("BUY")}
                  className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${
                    quickSide === "BUY" ? "bg-emerald-600 text-white" : "text-slate-300"
                  }`}
                >
                  Quick Buy
                </button>
                <button
                  onClick={() => setQuickSide("SELL")}
                  className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${
                    quickSide === "SELL" ? "bg-red-600 text-white" : "text-slate-300"
                  }`}
                >
                  Quick Sell
                </button>
              </div>

              <label className="space-y-1.5">
                <span className="text-xs uppercase tracking-wide text-slate-500">Active Pair</span>
                <select
                  value={quickPair}
                  onChange={(event) => setQuickPair(event.target.value)}
                  className="h-10 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {pairOptions.map((pair) => (
                    <option key={pair} value={pair}>
                      {pair}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid gap-2">
                <Link href="/p2p">
                  <Button className="w-full gap-2">
                    <ArrowRightLeft className="h-4 w-4" />
                    Start New Trade
                  </Button>
                </Link>
                <Link href="/demo-trading">
                  <Button variant="outline" className="w-full">
                    {quickSide} {quickPair}
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Wallet Summary</CardTitle>
              <CardDescription>Quick balances for active trading decisions.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-slate-300">
              <p>
                Available:{" "}
                <span className="font-semibold text-white">
                  {wallet ? formatMinorUnits(wallet.availableBalanceMinor, wallet.currency) : "-"}
                </span>
              </p>
              <p>
                Escrow:{" "}
                <span className="font-semibold text-white">
                  {wallet ? formatMinorUnits(wallet.escrowBalanceMinor, wallet.currency) : "-"}
                </span>
              </p>
              <Link href="/wallet">
                <Button variant="outline" className="mt-2 w-full">
                  Open Wallet
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {([
          ["ALL", "All Trades"],
          ["OPEN", "Open"],
          ["COMPLETED", "Completed"],
          ["CANCELLED", "Cancelled"],
          ["DISPUTED", "Disputed"],
        ] as const).map(([tab, label]) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`rounded-full border px-4 py-2 text-sm transition ${
              activeTab === tab
                ? "border-emerald-700/50 bg-emerald-500/10 text-emerald-200"
                : "border-zinc-700 bg-zinc-950 text-slate-300 hover:border-zinc-600"
            }`}
          >
            {label} ({tabCounts[tab]})
          </button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Trade History</CardTitle>
          <CardDescription>Newest trades first, filtered for your authenticated account only.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[1fr_220px]">
            <label className="relative">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-500" />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search trade id, pair, status, or counterparty..."
                className="h-10 w-full rounded-xl border border-zinc-700 bg-zinc-950 pl-10 pr-3 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </label>
            <select
              value={pairFilter}
              onChange={(event) => setPairFilter(event.target.value)}
              className="h-10 rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="ALL">All pairs</option>
              {pairOptions.map((pair) => (
                <option key={pair} value={pair}>
                  {pair}
                </option>
              ))}
            </select>
          </div>

          {loading ? (
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 px-4 py-8 text-sm text-slate-400">
              Loading your trade history...
            </div>
          ) : null}

          {!loading && filteredTrades.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-700 px-4 py-8 text-center">
              <p className="text-lg font-medium text-white">No trades yet</p>
              <p className="mt-2 text-sm text-slate-500">Start your first trade to see lifecycle updates here.</p>
              <div className="mt-4">
                <Link href="/p2p">
                  <Button>Start your first trade</Button>
                </Link>
              </div>
            </div>
          ) : null}

          {!loading && filteredTrades.length > 0 ? (
            <>
              <div className="overflow-x-auto rounded-xl border border-zinc-800">
                <table className="min-w-full divide-y divide-zinc-800 text-sm">
                  <thead className="bg-zinc-950/80 text-xs uppercase tracking-[0.12em] text-slate-500">
                    <tr>
                      <th className="px-4 py-3 text-left">Trade ID</th>
                      <th className="px-4 py-3 text-left">Pair</th>
                      <th className="px-4 py-3 text-left">Type</th>
                      <th className="px-4 py-3 text-left">Amount</th>
                      <th className="px-4 py-3 text-left">Price</th>
                      <th className="px-4 py-3 text-left">Counterparty</th>
                      <th className="px-4 py-3 text-left">Status</th>
                      <th className="px-4 py-3 text-left">Created At</th>
                      <th className="px-4 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800 bg-zinc-950/40">
                    {paginatedTrades.map((trade) => {
                      const pair = toTradePair(trade);
                      const direction = toTradeDirection(trade, user.id);
                      const dashboardStatus = toDashboardStatus(trade.status);
                      const createdAt = trade.createdAt ?? trade.openedAt ?? null;
                      const asset = trade.offer?.asset ?? "USDT";
                      const fiat = trade.offer?.fiatCurrency ?? "INR";

                      return (
                        <tr key={trade.id} className="hover:bg-zinc-900/40">
                          <td className="px-4 py-3 font-mono text-xs text-slate-200">{trade.id.slice(0, 12)}</td>
                          <td className="px-4 py-3 text-slate-100">{pair}</td>
                          <td className="px-4 py-3">
                            <span className={`rounded-full border px-2 py-1 text-xs font-medium ${directionTone(direction)}`}>
                              {direction}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-200">{formatMinorUnits(trade.amountMinor, asset)}</td>
                          <td className="px-4 py-3 text-slate-200">{formatMinorUnits(trade.fiatPriceMinor, fiat)}</td>
                          <td className="px-4 py-3 text-slate-200">{toCounterpartyLabel(trade, user.id)}</td>
                          <td className="px-4 py-3">
                            <span className={`rounded-full border px-2 py-1 text-xs font-medium ${statusBadgeTone(dashboardStatus)}`}>
                              {dashboardStatus}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-300">
                            {createdAt ? formatDateTime(createdAt) : "-"}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Link href={`/trades/${trade.id}`}>
                              <Button size="sm" variant="outline" className="gap-1.5">
                                <ListChecks className="h-3.5 w-3.5" />
                                View
                              </Button>
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-400">
                <p>
                  Page {currentPage} of {totalPages}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>

      <p className="flex items-center gap-2 text-xs text-slate-500">
        <ShieldCheck className="h-3.5 w-3.5" />
        Authenticated trade dashboard is scoped to your user session and sorted newest first.
      </p>
    </section>
  );
}

function SummaryCard({
  title,
  value,
  accent,
}: {
  title: string;
  value: string;
  accent: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className={`text-xl font-semibold ${accent}`}>{value}</p>
      </CardContent>
    </Card>
  );
}
