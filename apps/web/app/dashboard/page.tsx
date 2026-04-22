"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowDownToLine,
  ArrowUpFromLine,
  BellRing,
  CheckCircle2,
  Clock3,
  LayoutDashboard,
  ListChecks,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { tokenStore } from "@/lib/api";
import {
  DEMO_DASHBOARD_ACTIVITY,
  DEMO_DASHBOARD_ASSET_BALANCES,
  DEMO_DASHBOARD_OFFERS,
  DEMO_DASHBOARD_TRADES,
  DEMO_WALLET_SUMMARY,
  type DashboardActivityItem,
} from "@/lib/demo-data";
import { formatDateTime, formatMinorUnits } from "@/lib/money";
import { offerStatusLabel, tradeStatusLabel } from "@/lib/status";
import { useAuth } from "@/hooks/use-auth";
import { notificationService, type AppNotification } from "@/services/notification.service";
import { offersService, type OfferRecord } from "@/services/offers.service";
import { tradesService, type TradeRecord } from "@/services/trades.service";
import { walletService, type WalletSummary } from "@/services/wallet.service";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingState } from "@/components/ui/loading-state";

const ACTIVE_TRADE_STATUSES = new Set([
  "OPEN",
  "PAYMENT_PENDING",
  "PAYMENT_SENT",
  "RELEASE_PENDING",
  "DISPUTED",
  "PENDING_PAYMENT",
  "PAID",
]);
const COMPLETED_TRADE_STATUSES = new Set(["COMPLETED", "RELEASED"]);

function tradeStatusTone(status: string) {
  const normalized = status.toUpperCase();
  if (normalized === "RELEASE_PENDING") return "border-lime-700/50 bg-lime-950/40 text-lime-200";
  if (normalized.includes("RELEASE") || normalized.includes("COMPLETE")) return "border-emerald-700/50 bg-emerald-950/40 text-emerald-200";
  if (normalized.includes("PAID") || normalized.includes("SENT") || normalized.includes("PENDING"))
    return "border-lime-700/50 bg-lime-950/40 text-lime-200";
  if (normalized.includes("DISPUT")) return "border-amber-700/50 bg-amber-950/40 text-amber-200";
  if (normalized.includes("CANCEL")) return "border-red-700/50 bg-red-950/40 text-red-200";
  return "border-zinc-700/60 bg-zinc-900/60 text-slate-300";
}

function activityTone(type: DashboardActivityItem["type"]) {
  if (type === "TRADE_COMPLETED" || type === "ESCROW_RELEASED") return "text-emerald-300";
  if (type === "WITHDRAWAL") return "text-amber-300";
  if (type === "PAYMENT_MARKED") return "text-lime-300";
  return "text-slate-200";
}

function notificationTone(level: AppNotification["level"], read: boolean) {
  const opacity = read ? "opacity-70" : "";
  if (level === "CRITICAL") return `border-red-700/40 bg-red-950/20 text-red-100 ${opacity}`;
  if (level === "WARN") return `border-amber-700/40 bg-amber-950/20 text-amber-100 ${opacity}`;
  return `border-emerald-700/30 bg-emerald-950/10 text-emerald-100 ${opacity}`;
}

interface DashboardTradeRow {
  id: string;
  merchantName: string;
  side: "BUY" | "SELL";
  asset: string;
  amountMinor: string;
  fiatCurrency: string;
  paymentMethod: string;
  status: string;
}

interface DashboardOfferRow {
  id: string;
  side: "BUY" | "SELL";
  asset: string;
  fiatCurrency: string;
  priceMinor: string;
  paymentMethod: string;
  minAmountMinor: string;
  maxAmountMinor: string;
  status: string;
}

export default function DashboardPage() {
  const { user, isAuthenticated, isBootstrapping } = useAuth();
  const [wallet, setWallet] = useState<WalletSummary>(DEMO_WALLET_SUMMARY);
  const [trades, setTrades] = useState<TradeRecord[]>([]);
  const [offers, setOffers] = useState<OfferRecord[]>([]);
  const [walletFallbackActive, setWalletFallbackActive] = useState(false);
  const [tradesFallbackActive, setTradesFallbackActive] = useState(false);
  const [offersFallbackActive, setOffersFallbackActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isDemo, setIsDemo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  useEffect(() => {
    if (isBootstrapping) {
      return;
    }

    if (!isAuthenticated) {
      setWallet(DEMO_WALLET_SUMMARY);
      setTrades([]);
      setOffers([]);
      setWalletFallbackActive(false);
      setTradesFallbackActive(false);
      setOffersFallbackActive(false);
      setNotifications([]);
      setIsDemo(false);
      setError(null);
      setLoading(false);
      return;
    }

    (async () => {
      setLoading(true);
      const token = tokenStore.accessToken;
      if (!token) {
        setWallet(DEMO_WALLET_SUMMARY);
        setTrades([]);
        setOffers([]);
        setWalletFallbackActive(true);
        setTradesFallbackActive(true);
        setOffersFallbackActive(true);
        setIsDemo(true);
        setError("Live dashboard session is syncing. Showing your latest safe snapshot until access is ready.");
        setLoading(false);
        return;
      }

      const [walletResult, tradesResult, offersResult] = await Promise.allSettled([
        walletService.getWallet(token),
        tradesService.listMine(token),
        offersService.list(),
      ]);

      const issues: string[] = [];
      let demoFallback = false;

      const walletValue = walletResult.status === "fulfilled" ? walletResult.value : DEMO_WALLET_SUMMARY;
      const tradesValue = tradesResult.status === "fulfilled" ? tradesResult.value : [];
      const offersValue = offersResult.status === "fulfilled" ? offersResult.value : [];
      const walletFallback = walletResult.status !== "fulfilled";
      const tradesFallback = tradesResult.status !== "fulfilled";
      const offersFallback = offersResult.status !== "fulfilled";

      if (walletResult.status === "fulfilled") {
        setWallet(walletValue);
      } else {
        setWallet(walletValue);
        demoFallback = true;
        issues.push("wallet");
      }

      if (tradesResult.status === "fulfilled") {
        setTrades(tradesValue);
      } else {
        setTrades(tradesValue);
        demoFallback = true;
        issues.push("trades");
      }

      if (offersResult.status === "fulfilled") {
        setOffers(offersValue);
      } else {
        setOffers(offersValue);
        demoFallback = true;
        issues.push("offers");
      }

      setWalletFallbackActive(walletFallback);
      setTradesFallbackActive(tradesFallback);
      setOffersFallbackActive(offersFallback);

      if (user?.id) {
        const ownOfferSource = offersValue.filter((offer) => offer.userId === user.id);
        const notificationsPayload = await notificationService.list({
          token,
          userId: user.id,
          wallet: walletValue,
          trades: tradesValue,
          offers: ownOfferSource,
          scope: "P2P",
        });
        setNotifications(notificationsPayload);
      } else {
        setNotifications([]);
      }

      setIsDemo(demoFallback);
      setError(
        issues.length > 0
          ? `Some live ${issues.join(", ")} data is unavailable, so demo-safe fallback data is shown.`
          : null,
      );
      setLoading(false);
    })();
  }, [isAuthenticated, isBootstrapping, user?.id]);

  const available = BigInt(wallet.availableBalanceMinor || "0");
  const locked = BigInt(wallet.escrowBalanceMinor || "0");
  const total = available + locked;
  const ownOffers = user?.id ? offers.filter((offer) => offer.userId === user.id) : [];
  const activeTradesCount = trades.filter((trade) => ACTIVE_TRADE_STATUSES.has(trade.status.toUpperCase())).length;
  const completedTradesCount = trades.filter((trade) => COMPLETED_TRADE_STATUSES.has(trade.status.toUpperCase())).length;
  const openOffersCount = ownOffers.filter((offer) => (offer.status ?? "ACTIVE").toUpperCase() === "ACTIVE").length;
  const activeTradesDisplayCount =
    activeTradesCount === 0 && tradesFallbackActive ? DEMO_DASHBOARD_TRADES.length : activeTradesCount;
  const completedTradesDisplayCount =
    completedTradesCount === 0 && tradesFallbackActive
      ? DEMO_DASHBOARD_TRADES.filter((trade) => COMPLETED_TRADE_STATUSES.has(trade.status.toUpperCase())).length
      : completedTradesCount;
  const openOffersDisplayCount =
    openOffersCount === 0 && offersFallbackActive ? DEMO_DASHBOARD_OFFERS.length : openOffersCount;
  const useDemoActivityFallback = walletFallbackActive || tradesFallbackActive || offersFallbackActive;

  const tradeRows: DashboardTradeRow[] = useMemo(() => {
    if (trades.length === 0) {
      return tradesFallbackActive ? DEMO_DASHBOARD_TRADES : [];
    }

    return trades
      .filter(
        (trade) =>
          ACTIVE_TRADE_STATUSES.has(trade.status.toUpperCase()) ||
          COMPLETED_TRADE_STATUSES.has(trade.status.toUpperCase()),
      )
      .slice(0, 4)
      .map((trade) => {
        const isBuyer = user?.id === trade.buyerId;
        const counterpartyId = isBuyer ? trade.sellerId : trade.buyerId;
        return {
          id: trade.id,
          merchantName: `Trader ${counterpartyId.slice(0, 6).toUpperCase()}`,
          side: isBuyer ? "BUY" : "SELL",
          asset: trade.offer?.asset ?? "USDT",
          amountMinor: trade.amountMinor,
          fiatCurrency: trade.offer?.fiatCurrency ?? "INR",
          paymentMethod: trade.offer?.paymentMethod ?? "Bank Transfer",
          status: trade.status,
        };
      });
  }, [trades, user?.id, tradesFallbackActive]);

  const offerRows: DashboardOfferRow[] = useMemo(() => {
    if (ownOffers.length === 0) {
      return offersFallbackActive ? DEMO_DASHBOARD_OFFERS : [];
    }

    return ownOffers.slice(0, 4).map((offer) => ({
      id: offer.id,
      side: offer.type,
      asset: offer.asset,
      fiatCurrency: offer.fiatCurrency,
      priceMinor: offer.priceMinor,
      paymentMethod: offer.paymentMethod,
      minAmountMinor: offer.minAmountMinor,
      maxAmountMinor: offer.maxAmountMinor,
      status: (offer.status ?? "ACTIVE").toUpperCase(),
    }));
  }, [ownOffers, offersFallbackActive]);

  const activity: DashboardActivityItem[] = useMemo(() => {
    const liveActivity: DashboardActivityItem[] = [];

    wallet.ledger.slice(0, 5).forEach((item) => {
      const upper = item.type.toUpperCase();
      let type: DashboardActivityItem["type"] = "DEPOSIT";
      if (upper.includes("WITHDRAWAL")) type = "WITHDRAWAL";
      if (upper.includes("ESCROW_RELEASE")) type = "ESCROW_RELEASED";
      if (upper.includes("ESCROW_HOLD")) type = "TRADE_STARTED";

      liveActivity.push({
        id: `ledger-${item.id}`,
        type,
        title: item.type.replace(/_/g, " "),
        createdAt: item.createdAt,
      });
    });

    trades.slice(0, 5).forEach((trade) => {
      const status = trade.status.toUpperCase();
      let type: DashboardActivityItem["type"] = "TRADE_STARTED";
      let title = `Trade ${trade.id.slice(0, 8)} started`;

      if (status === "PAYMENT_SENT" || status === "PAID") {
        type = "PAYMENT_MARKED";
        title = `Payment marked for trade ${trade.id.slice(0, 8)}`;
      } else if (status === "COMPLETED" || status === "RELEASED") {
        type = "TRADE_COMPLETED";
        title = `Trade ${trade.id.slice(0, 8)} completed`;
      }

      liveActivity.push({
        id: `trade-${trade.id}`,
        type,
        title,
        createdAt: trade.updatedAt ?? trade.createdAt ?? new Date().toISOString(),
      });
    });

    ownOffers.slice(0, 3).forEach((offer) => {
      liveActivity.push({
        id: `offer-${offer.id}`,
        type: "OFFER_CREATED",
        title: `${offer.type} offer for ${offer.asset} is ${offer.status ?? "ACTIVE"}`,
        createdAt: offer.createdAt ?? new Date().toISOString(),
      });
    });

    if (liveActivity.length === 0) {
      return useDemoActivityFallback ? DEMO_DASHBOARD_ACTIVITY : [];
    }
    return liveActivity
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 6);
  }, [wallet.ledger, trades, ownOffers, useDemoActivityFallback]);

  const unreadCount = notifications.filter((item) => !item.read).length;

  const assetBalances = useMemo(
    () => {
      const primaryAsset = {
        asset: wallet.currency,
        network: "Primary Wallet",
        availableMinor: available.toString(),
        lockedMinor: locked.toString(),
        changePct24h: 0,
      };

      return walletFallbackActive ? [primaryAsset, ...DEMO_DASHBOARD_ASSET_BALANCES] : [primaryAsset];
    },
    [wallet.currency, available, locked, walletFallbackActive],
  );

  async function markNotificationRead(id: string) {
    if (!user?.id) return;
    const token = tokenStore.accessToken ?? undefined;
    await notificationService.markAsRead(user.id, id, token);
    setNotifications((prev) => prev.map((item) => (item.id === id ? { ...item, read: true } : item)));
  }

  async function markAllRead() {
    if (!user?.id) return;
    const token = tokenStore.accessToken ?? undefined;
    const unreadIds = notifications.filter((item) => !item.read).map((item) => item.id);
    await notificationService.markAllAsRead(user.id, unreadIds, token);
    setNotifications((prev) => prev.map((item) => ({ ...item, read: true })));
  }

  if (isBootstrapping) {
    return <LoadingState label="Preparing your dashboard" />;
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
        <p className="text-xs uppercase tracking-[0.2em] text-emerald-300">Xorviqa Console</p>
        <h1 className="text-3xl font-semibold text-white">Dashboard</h1>
        <p className="text-sm text-slate-400">Portfolio, wallet operations, P2P trade status, and marketplace signals.</p>
      </header>

      {error ? (
        <Card className="border-amber-500/30 bg-amber-950/20">
          <CardContent className="pt-6">
            <p className="text-sm text-amber-200">{error}</p>
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
              <Link href="/p2p" className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-300 hover:bg-zinc-800">
                <TrendingUp className="h-4 w-4 text-slate-400" />
                P2P Market
              </Link>
              <Link href="/trades" className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-300 hover:bg-zinc-800">
                <ListChecks className="h-4 w-4 text-slate-400" />
                Trades
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
                {unreadCount > 0 ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-amber-200">
                    <BellRing className="h-3.5 w-3.5" />
                    {unreadCount} unread alerts
                  </span>
                ) : null}
                {isDemo ? (
                  <span className="inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-amber-200">
                    Demo fallback active
                  </span>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-7">
            <Card className="xl:col-span-2">
              <CardHeader className="pb-2">
                <CardDescription>Total Portfolio</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-xl font-semibold text-white">{formatMinorUnits(total.toString(), wallet.currency)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Available</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-xl font-semibold text-emerald-300">{formatMinorUnits(available.toString(), wallet.currency)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Locked</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-xl font-semibold text-lime-300">{formatMinorUnits(locked.toString(), wallet.currency)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Active Trades</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-xl font-semibold text-white">{activeTradesDisplayCount}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Completed Trades</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-xl font-semibold text-white">{completedTradesDisplayCount}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Open Offers</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-xl font-semibold text-white">{openOffersDisplayCount}</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-5">
            <Card className="lg:col-span-3">
              <CardHeader>
                <CardTitle className="text-lg">Portfolio Assets</CardTitle>
                <CardDescription>Wallet and major trading assets snapshot</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {assetBalances.map((asset) => (
                  <div key={`${asset.asset}-${asset.network}`} className="grid gap-2 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 md:grid-cols-[1.3fr_1fr_1fr_auto] md:items-center">
                    <div>
                      <p className="text-sm font-medium text-slate-100">{asset.asset}</p>
                      <p className="text-xs text-slate-500">{asset.network}</p>
                    </div>
                    <p className="text-sm text-emerald-300">{formatMinorUnits(asset.availableMinor, asset.asset)}</p>
                    <p className="text-sm text-lime-300">{formatMinorUnits(asset.lockedMinor, asset.asset)}</p>
                    <p className={`text-xs ${asset.changePct24h >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                      {asset.changePct24h >= 0 ? "+" : ""}
                      {asset.changePct24h.toFixed(1)}% 24h
                    </p>
                  </div>
                ))}
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
                <Link href="/p2p">
                  <Button variant="outline" className="w-full justify-start gap-2">
                    <TrendingUp className="h-4 w-4" />
                    Open P2P
                  </Button>
                </Link>
                <Link href="/trades">
                  <Button variant="outline" className="w-full justify-start gap-2">
                    <ListChecks className="h-4 w-4" />
                    View Trades
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Recent Activity</CardTitle>
                <CardDescription>Wallet, trades, and offers timeline</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {activity.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-zinc-700 px-3 py-4 text-sm text-slate-500">
                    No recent activity yet. Start by making a deposit or opening a trade.
                  </div>
                ) : (
                  activity.map((item) => (
                    <div key={item.id} className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
                      <p className={`text-sm font-medium ${activityTone(item.type)}`}>{item.title}</p>
                      <p className="mt-1 flex items-center gap-1 text-xs text-slate-400">
                        <Clock3 className="h-3.5 w-3.5" />
                        {formatDateTime(item.createdAt)}
                      </p>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-lg">Notifications</CardTitle>
                  <CardDescription>Trade, offer, wallet, and security alerts</CardDescription>
                </div>
                {unreadCount > 0 ? (
                  <Button size="sm" variant="outline" onClick={() => void markAllRead()}>
                    Mark all read
                  </Button>
                ) : null}
              </CardHeader>
              <CardContent className="space-y-3">
                {notifications.map((item) => (
                  <div key={item.id} className={`rounded-xl border p-3 ${notificationTone(item.level, item.read)}`}>
                    <div className="flex items-start justify-between gap-2">
                      <p className="flex items-start gap-2 text-sm">
                        {item.level === "CRITICAL" ? (
                          <ShieldAlert className="mt-0.5 h-4 w-4" />
                        ) : item.level === "WARN" ? (
                          <AlertCircle className="mt-0.5 h-4 w-4" />
                        ) : (
                          <BellRing className="mt-0.5 h-4 w-4" />
                        )}
                        <span>
                          <span className="font-medium">{item.title}</span>
                          <span className="block text-xs text-slate-300">{item.message}</span>
                        </span>
                      </p>
                      {!item.read ? (
                        <Button size="sm" variant="outline" onClick={() => void markNotificationRead(item.id)}>
                          Read
                        </Button>
                      ) : (
                        <span className="text-xs text-slate-400">Read</span>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Active Trades</CardTitle>
                <CardDescription>Quick preview of your trade workspace</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {tradeRows.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-zinc-700 px-3 py-4 text-sm text-slate-500">
                    No active P2P trades yet.
                  </div>
                ) : (
                  tradeRows.map((trade) => (
                    <div key={trade.id} className="grid gap-2 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 md:grid-cols-[1.3fr_1fr_auto] md:items-center">
                      <div>
                        <p className="text-sm font-medium text-slate-100">{trade.merchantName}</p>
                        <p className="text-xs text-slate-500">
                          {trade.side} {trade.asset} · {trade.paymentMethod}
                        </p>
                        <p className="text-xs text-slate-400">{formatMinorUnits(trade.amountMinor, trade.asset)}</p>
                      </div>
                      <span className={`inline-flex w-fit rounded-full border px-2 py-1 text-xs ${tradeStatusTone(trade.status)}`}>
                        {tradeStatusLabel(trade.status)}
                      </span>
                      <Link href={`/trades/${trade.id}`}>
                        <Button size="sm" variant="outline">
                          Open
                        </Button>
                      </Link>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Open Offers</CardTitle>
                <CardDescription>
                  {openOffersDisplayCount > 0
                    ? `${openOffersDisplayCount} offer(s) currently active`
                    : "Manage your market offers"}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {offerRows.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-zinc-700 px-3 py-4 text-sm text-slate-500">
                    No offers yet. Create your first offer in the P2P market.
                  </div>
                ) : (
                  offerRows.map((offer) => (
                    <div key={offer.id} className="grid gap-2 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 md:grid-cols-[1.3fr_1fr_auto] md:items-center">
                      <div>
                        <p className="text-sm font-medium text-slate-100">
                          {offer.side} {offer.asset}
                        </p>
                        <p className="text-xs text-slate-500">
                          {offer.paymentMethod} · {formatMinorUnits(offer.priceMinor, offer.fiatCurrency)}
                        </p>
                        <p className="text-xs text-slate-400">
                          Limits: {formatMinorUnits(offer.minAmountMinor, offer.fiatCurrency)} -{" "}
                          {formatMinorUnits(offer.maxAmountMinor, offer.fiatCurrency)}
                        </p>
                      </div>
                      <span className="inline-flex w-fit rounded-full border border-emerald-700/40 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-200">
                        {offerStatusLabel(offer.status)}
                      </span>
                      <Link href="/offers">
                        <Button size="sm" variant="outline">
                          Manage
                        </Button>
                      </Link>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          {loading ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="h-20 animate-pulse rounded-xl border border-zinc-800 bg-zinc-900/50" />
              <div className="h-20 animate-pulse rounded-xl border border-zinc-800 bg-zinc-900/50" />
            </div>
          ) : null}

          <p className="flex items-center gap-1 text-xs text-slate-500">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Dashboard data syncs with wallet, trades, and offers modules with demo-safe fallback when needed.
          </p>
        </div>
      </div>
    </section>
  );
}

