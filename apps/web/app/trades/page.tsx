"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRightLeft, BarChart3, ListChecks, Search, ShieldCheck } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { tokenStore } from "@/lib/api";
import { friendlyErrorMessage } from "@/lib/errors";
import { formatDateTime, formatMinorUnits } from "@/lib/money";
import { tradesService, type TradeRecord } from "@/services/trades.service";
import { walletService, type WalletSummary } from "@/services/wallet.service";
import { marketsService, toMarketDataErrorMessage, type MarketCandle } from "@/services/markets.service";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingState } from "@/components/ui/loading-state";
import { LightweightMarketChart } from "@/components/markets/lightweight-market-chart";

type TradeDashboardTab = "ALL" | "OPEN" | "COMPLETED" | "CANCELLED" | "DISPUTED";
type TradeDirection = "BUY" | "SELL";
type DashboardStatus = "OPEN" | "PAID" | "RELEASED" | "COMPLETED" | "CANCELLED" | "DISPUTED";
type ChartStreamState = "LIVE" | "RECONNECTING" | "DELAYED";

type PairMarketSummary = {
  symbol: string;
  displaySymbol: string;
  lastPrice: string;
  changePercent: string;
  highPrice: string;
  lowPrice: string;
  quoteVolume: string;
  updatedAt: number;
};

type PositionSummary = {
  key: string;
  pair: string;
  direction: TradeDirection;
  asset: string;
  amountMinor: bigint;
  tradeCount: number;
  status: DashboardStatus;
};

const PAGE_SIZE = 8;
const CHART_INTERVAL = "15m";
const CHART_LIMIT = 96;
const QUICK_PAIRS = [
  "BTC/USDT",
  "ETH/USDT",
  "SOL/USDT",
  "BNB/USDT",
  "XRP/USDT",
  "DOGE/USDT",
  "ADA/USDT",
  "AVAX/USDT",
  "LINK/USDT",
  "TON/USDT",
];

function toDashboardStatus(status: string): DashboardStatus {
  const normalized = status.toUpperCase();
  if (normalized === "OPEN" || normalized === "PAYMENT_PENDING" || normalized === "PENDING_PAYMENT") return "OPEN";
  if (normalized === "PAYMENT_SENT" || normalized === "PAID") return "PAID";
  if (normalized === "RELEASE_PENDING" || normalized === "RELEASED") return "RELEASED";
  if (normalized === "COMPLETED") return "COMPLETED";
  if (normalized === "CANCELLED" || normalized === "CANCELED") return "CANCELLED";
  if (normalized === "DISPUTED") return "DISPUTED";
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
  if (counterparty?.username) return counterparty.username;
  return `User ${counterpartyId.slice(0, 8)}`;
}

function statusBadgeTone(status: DashboardStatus) {
  if (status === "COMPLETED" || status === "RELEASED") return "border-emerald-700/40 bg-emerald-950/30 text-emerald-200";
  if (status === "OPEN") return "border-sky-700/40 bg-sky-950/30 text-sky-200";
  if (status === "PAID") return "border-amber-700/40 bg-amber-950/30 text-amber-200";
  if (status === "CANCELLED" || status === "DISPUTED") return "border-red-700/40 bg-red-950/30 text-red-200";
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

function toMarketSymbol(pair: string) {
  return pair.replace("/", "").toUpperCase();
}

function toPairLabel(symbol: string) {
  const upper = symbol.toUpperCase();
  const quotes = ["USDT", "USDC", "BTC", "ETH", "BNB", "INR", "TRY", "EUR"];
  for (const quote of quotes) {
    if (upper.endsWith(quote) && upper.length > quote.length) {
      return `${upper.slice(0, -quote.length)}/${quote}`;
    }
  }
  return upper;
}

function formatPrice(raw: string) {
  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value)) return "-";
  if (value >= 1000) return `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  if (value >= 1) return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 8 })}`;
}

function formatPercent(raw: string) {
  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value)) return "0.00%";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function formatCompact(raw: string) {
  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value)) return "-";
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(value);
}

function formatRelativeTime(value: string | null | undefined) {
  if (!value) return "-";
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "-";
  const diffMs = Date.now() - timestamp;
  if (diffMs < 60_000) return "just now";
  if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}m ago`;
  if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)}h ago`;
  return `${Math.floor(diffMs / 86_400_000)}d ago`;
}

function buildDemoCandles(symbol: string, anchorPrice: string): MarketCandle[] {
  const now = Date.now();
  const basePrice = Number.parseFloat(anchorPrice);
  const seed = Number.isFinite(basePrice) && basePrice > 0 ? basePrice : 100;

  return Array.from({ length: CHART_LIMIT }).map((_, index) => {
    const openTime = now - (CHART_LIMIT - index) * 15 * 60_000;
    const drift = (Math.sin(index / 5) + Math.cos(index / 7)) * 0.004;
    const open = seed * (1 + drift);
    const close = open * (1 + Math.sin(index / 3) * 0.0022);
    const high = Math.max(open, close) * 1.0018;
    const low = Math.min(open, close) * 0.9982;

    return {
      symbol,
      interval: CHART_INTERVAL,
      openTime,
      closeTime: openTime + 15 * 60_000 - 1,
      open: open.toFixed(8),
      high: high.toFixed(8),
      low: low.toFixed(8),
      close: close.toFixed(8),
      volume: String(120 + index * 1.25),
      quoteVolume: String((120 + index * 1.25) * close),
      tradeCount: 120 + index,
      isClosed: true,
      updatedAt: now,
    } satisfies MarketCandle;
  });
}

function toKlineCandles(symbol: string, payload: unknown): MarketCandle[] {
  if (!Array.isArray(payload)) return [];
  const now = Date.now();
  const candles: MarketCandle[] = [];

  payload.forEach((entry) => {
    if (!Array.isArray(entry) || entry.length < 9) return;
    const openTime = Number(entry[0]);
    const closeTime = Number(entry[6]);
    if (!Number.isFinite(openTime) || !Number.isFinite(closeTime)) return;

    candles.push({
      symbol,
      interval: CHART_INTERVAL,
      openTime,
      closeTime,
      open: String(entry[1] ?? ""),
      high: String(entry[2] ?? ""),
      low: String(entry[3] ?? ""),
      close: String(entry[4] ?? ""),
      volume: String(entry[5] ?? "0"),
      quoteVolume: String(entry[7] ?? "0"),
      tradeCount: Number(entry[8] ?? 0),
      isClosed: true,
      updatedAt: now,
    });
  });

  return candles.slice(-CHART_LIMIT);
}

export default function TradesPage() {
  const { user, isAuthenticated, isBootstrapping } = useAuth();
  const authenticatedUser = isAuthenticated && user ? user : null;

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
  const [marketSummary, setMarketSummary] = useState<PairMarketSummary | null>(null);
  const [marketSummaryLoading, setMarketSummaryLoading] = useState(false);
  const [marketSummaryError, setMarketSummaryError] = useState<string | null>(null);
  const [chartCandles, setChartCandles] = useState<MarketCandle[]>([]);
  const [chartLoading, setChartLoading] = useState(false);
  const [chartStreamState, setChartStreamState] = useState<ChartStreamState>("DELAYED");

  useEffect(() => {
    if (isBootstrapping) return;

    if (!authenticatedUser) {
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

      const token = tokenStore.accessToken ?? undefined;

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
        setError(friendlyErrorMessage(err, "Unable to load your trade dashboard right now."));
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadDashboard();

    return () => {
      active = false;
    };
  }, [authenticatedUser?.id, isBootstrapping, refreshNonce]);

  const pairOptions = useMemo(() => {
    const pairs = new Set<string>(QUICK_PAIRS);
    trades.forEach((trade) => pairs.add(toTradePair(trade)));
    return [...pairs];
  }, [trades]);

  useEffect(() => {
    if (pairOptions.includes(quickPair)) return;
    setQuickPair(pairOptions[0] ?? QUICK_PAIRS[0]);
  }, [pairOptions, quickPair]);

  const selectedMarketSymbol = useMemo(() => toMarketSymbol(quickPair), [quickPair]);

  useEffect(() => {
    let active = true;

    const loadMarketContext = async () => {
      setMarketSummaryLoading(true);
      setChartLoading(true);
      setChartStreamState("DELAYED");
      let summaryAnchorPrice = "100";

      try {
        const overview = await marketsService.getOverview([selectedMarketSymbol]);
        if (!active) return;

        const selectedPair = overview.pairs.find((pair) => pair.symbol === selectedMarketSymbol) ?? overview.pairs[0] ?? null;
        if (selectedPair) {
          setMarketSummary({
            symbol: selectedPair.symbol,
            displaySymbol: selectedPair.displaySymbol || toPairLabel(selectedPair.symbol),
            lastPrice: selectedPair.lastPrice,
            changePercent: selectedPair.priceChangePercent,
            highPrice: selectedPair.highPrice,
            lowPrice: selectedPair.lowPrice,
            quoteVolume: selectedPair.quoteVolume,
            updatedAt: selectedPair.updatedAt || Date.now(),
          });
          summaryAnchorPrice = selectedPair.lastPrice;
          setMarketSummaryError(null);
        } else {
          setMarketSummary(null);
          setMarketSummaryError("Pair market snapshot unavailable.");
          console.warn("[trade-market] fallback reason: missing summary pair", { symbol: selectedMarketSymbol });
        }
      } catch (marketErr) {
        if (!active) return;
        console.warn("[trade-market] fallback reason: market summary fetch failed", marketErr);
        setMarketSummaryError(toMarketDataErrorMessage(marketErr, "Unable to load market summary."));
      } finally {
        if (active) setMarketSummaryLoading(false);
      }

      try {
        const response = await fetch(
          `https://api.binance.com/api/v3/klines?symbol=${selectedMarketSymbol}&interval=${CHART_INTERVAL}&limit=${CHART_LIMIT}`,
          { cache: "no-store" },
        );
        if (!response.ok) {
          throw new Error(`Chart request failed (${response.status}).`);
        }

        const payload = await response.json();
        if (!active) return;

        const normalized = toKlineCandles(selectedMarketSymbol, payload);
        if (normalized.length > 0) {
          setChartCandles(normalized);
          const latestCandle = normalized[normalized.length - 1];
          summaryAnchorPrice = latestCandle?.close ?? summaryAnchorPrice;
        } else {
          console.warn("[trade-market] fallback reason: empty candle payload", { symbol: selectedMarketSymbol });
          setChartCandles(buildDemoCandles(selectedMarketSymbol, summaryAnchorPrice));
        }
      } catch (chartErr) {
        if (!active) return;
        console.warn("[trade-market] fallback reason: candle REST request failed", chartErr);
        setChartCandles(buildDemoCandles(selectedMarketSymbol, summaryAnchorPrice));
      } finally {
        if (active) setChartLoading(false);
      }
    };

    void loadMarketContext();

    return () => {
      active = false;
    };
  }, [selectedMarketSymbol, refreshNonce]);

  useEffect(() => {
    let active = true;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let receivedUpdate = false;
    const streamSymbol = selectedMarketSymbol.toLowerCase();
    const streamUrl = `wss://stream.binance.com:9443/stream?streams=${streamSymbol}@kline_${CHART_INTERVAL}/${streamSymbol}@ticker`;

    const clearReconnectTimer = () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const connect = () => {
      if (!active) return;
      clearReconnectTimer();

      try {
        ws = new WebSocket(streamUrl);
      } catch (error) {
        console.error("[trade-market] websocket connection failed", { symbol: selectedMarketSymbol, interval: CHART_INTERVAL, error });
        setChartStreamState("DELAYED");
        reconnectTimer = setTimeout(connect, 2_000);
        return;
      }

      ws.onopen = () => {
        if (!active) return;
        console.info("[trade-market] websocket connected", { symbol: selectedMarketSymbol, interval: CHART_INTERVAL });
        console.info("[trade-market] subscribed symbol", { symbol: selectedMarketSymbol, interval: CHART_INTERVAL, streamUrl });
      };

      ws.onmessage = (event) => {
        if (!active) return;

        let payload: unknown;
        try {
          payload = JSON.parse(event.data);
        } catch (parseError) {
          console.warn("[trade-market] websocket payload parse failed", parseError);
          return;
        }

        const data =
          payload && typeof payload === "object" && "data" in payload
            ? (payload as { data?: unknown }).data
            : payload;
        if (!data || typeof data !== "object") return;

        const record = data as Record<string, unknown>;
        const eventType = String(record.e ?? "");

        if (eventType === "kline" && record.k && typeof record.k === "object") {
          const kline = record.k as Record<string, unknown>;
          const openTime = Number(kline.t);
          const closeTime = Number(kline.T);
          const updateTime = Number(record.E ?? Date.now());
          if (!Number.isFinite(openTime) || !Number.isFinite(closeTime)) return;

          const liveCandle: MarketCandle = {
            symbol: selectedMarketSymbol,
            interval: CHART_INTERVAL,
            openTime,
            closeTime,
            open: String(kline.o ?? "0"),
            high: String(kline.h ?? "0"),
            low: String(kline.l ?? "0"),
            close: String(kline.c ?? "0"),
            volume: String(kline.v ?? "0"),
            quoteVolume: String(kline.q ?? "0"),
            tradeCount: Number(kline.n ?? 0),
            isClosed: Boolean(kline.x),
            updatedAt: Number.isFinite(updateTime) ? updateTime : Date.now(),
          };

          setChartCandles((previous) => {
            if (previous.length === 0) return [liveCandle];
            const last = previous[previous.length - 1];
            if (last.openTime === liveCandle.openTime) {
              return [...previous.slice(0, -1), liveCandle];
            }
            return [...previous, liveCandle].slice(-CHART_LIMIT);
          });

          setMarketSummary((previous) => {
            const base = previous ?? {
              symbol: selectedMarketSymbol,
              displaySymbol: toPairLabel(selectedMarketSymbol),
              lastPrice: "0",
              changePercent: "0",
              highPrice: "0",
              lowPrice: "0",
              quoteVolume: "0",
              updatedAt: Date.now(),
            };
            return {
              ...base,
              lastPrice: liveCandle.close,
              updatedAt: liveCandle.updatedAt,
            };
          });

          receivedUpdate = true;
          setChartStreamState("LIVE");
          setMarketSummaryError(null);
          console.debug("[trade-market] candle update received", {
            symbol: selectedMarketSymbol,
            interval: CHART_INTERVAL,
            openTime,
            close: liveCandle.close,
          });
          return;
        }

        if (eventType === "24hrTicker") {
          const updatedAt = Number(record.E ?? Date.now());
          setMarketSummary((previous) => {
            const base = previous ?? {
              symbol: selectedMarketSymbol,
              displaySymbol: toPairLabel(selectedMarketSymbol),
              lastPrice: "0",
              changePercent: "0",
              highPrice: "0",
              lowPrice: "0",
              quoteVolume: "0",
              updatedAt: Date.now(),
            };

            return {
              ...base,
              symbol: selectedMarketSymbol,
              displaySymbol: base.displaySymbol || toPairLabel(selectedMarketSymbol),
              lastPrice: typeof record.c === "string" ? record.c : base.lastPrice,
              changePercent: typeof record.P === "string" ? record.P : base.changePercent,
              highPrice: typeof record.h === "string" ? record.h : base.highPrice,
              lowPrice: typeof record.l === "string" ? record.l : base.lowPrice,
              quoteVolume: typeof record.q === "string" ? record.q : base.quoteVolume,
              updatedAt: Number.isFinite(updatedAt) ? updatedAt : Date.now(),
            };
          });

          receivedUpdate = true;
          setChartStreamState("LIVE");
          setMarketSummaryError(null);
        }
      };

      ws.onerror = (error) => {
        if (!active) return;
        console.warn("[trade-market] websocket error", { symbol: selectedMarketSymbol, interval: CHART_INTERVAL, error });
      };

      ws.onclose = () => {
        if (!active) return;
        console.warn("[trade-market] websocket disconnected", {
          symbol: selectedMarketSymbol,
          interval: CHART_INTERVAL,
          receivedUpdate,
        });
        setChartStreamState("RECONNECTING");
        reconnectTimer = setTimeout(connect, 2_000);
      };
    };

    connect();

    return () => {
      active = false;
      clearReconnectTimer();
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        ws.close();
      }
    };
  }, [selectedMarketSymbol, refreshNonce]);

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

  const sortedTrades = useMemo(
    () => [...trades].sort((left, right) => parseTradeTimestamp(right) - parseTradeTimestamp(left)),
    [trades],
  );

  const filteredTrades = useMemo(() => {
    if (!authenticatedUser) return [] as TradeRecord[];

    const loweredSearch = searchQuery.trim().toLowerCase();

    return sortedTrades.filter((trade) => {
      const dashboardStatus = toDashboardStatus(trade.status);
      if (activeTab === "OPEN" && !isOpenLifecycle(dashboardStatus)) return false;
      if (activeTab === "COMPLETED" && dashboardStatus !== "COMPLETED") return false;
      if (activeTab === "CANCELLED" && dashboardStatus !== "CANCELLED") return false;
      if (activeTab === "DISPUTED" && dashboardStatus !== "DISPUTED") return false;

      const pair = toTradePair(trade);
      if (pairFilter !== "ALL" && pair !== pairFilter) return false;

      if (!loweredSearch) return true;

      const direction = toTradeDirection(trade, authenticatedUser.id);
      const counterparty = toCounterpartyLabel(trade, authenticatedUser.id);

      const haystack = [trade.id, pair, direction, counterparty, dashboardStatus, trade.offer?.paymentMethod ?? ""]
        .join(" ")
        .toLowerCase();

      return haystack.includes(loweredSearch);
    });
  }, [activeTab, authenticatedUser, pairFilter, searchQuery, sortedTrades]);

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

  const openLifecycleTrades = useMemo(
    () => sortedTrades.filter((trade) => isOpenLifecycle(toDashboardStatus(trade.status))),
    [sortedTrades],
  );

  const openOrders = useMemo(() => openLifecycleTrades.slice(0, 6), [openLifecycleTrades]);

  const positionRows = useMemo(() => {
    if (!authenticatedUser) return [] as PositionSummary[];

    const positions = new Map<string, PositionSummary>();
    openLifecycleTrades.forEach((trade) => {
      const pair = toTradePair(trade);
      const direction = toTradeDirection(trade, authenticatedUser.id);
      const asset = trade.offer?.asset ?? "USDT";
      const key = `${pair}:${direction}`;
      const existing = positions.get(key);
      const amountMinor = safeBigInt(trade.amountMinor);
      const status = toDashboardStatus(trade.status);

      if (!existing) {
        positions.set(key, { key, pair, direction, asset, amountMinor, tradeCount: 1, status });
        return;
      }

      existing.amountMinor += amountMinor;
      existing.tradeCount += 1;
      existing.status = status;
    });

    return [...positions.values()].slice(0, 6);
  }, [authenticatedUser, openLifecycleTrades]);

  const recentActivity = useMemo(() => sortedTrades.slice(0, 6), [sortedTrades]);
  const dashboardLoading = loading && trades.length === 0;

  if (isBootstrapping) {
    return <LoadingState label="Loading trade dashboard" />;
  }

  if (!authenticatedUser) {
    return (
      <section className="space-y-6">
        <header className="space-y-2">
          <p className="text-xs uppercase tracking-[0.2em] text-emerald-300">Trades</p>
          <h1 className="text-3xl font-semibold text-white">P2P Trade Dashboard</h1>
          <p className="text-sm text-slate-400">Sign in to view your open trades, completed history, and lifecycle updates.</p>
        </header>

        <Card className="border-zinc-800 bg-zinc-950/60">
          <CardContent className="space-y-4 pt-6">
            <p className="text-sm text-slate-300">Sign in to open your trade workspace.</p>
            <div className="flex flex-wrap gap-3">
              <Link href="/login?next=/trades"><Button>Log in</Button></Link>
              <Link href="/signup"><Button variant="outline">Create account</Button></Link>
            </div>
          </CardContent>
        </Card>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-emerald-300">Trades</p>
            <h1 className="text-3xl font-semibold text-white">My Trading Workspace</h1>
            <p className="text-sm text-slate-400">
              Real-time pair context, lifecycle tracking, and authenticated trade operations in one dashboard.
            </p>
          </div>
          <Button variant="outline" onClick={() => setRefreshNonce((current) => current + 1)}>Refresh</Button>
        </div>
      </header>

      {error ? (
        <Card className="border-red-700/30 bg-red-950/20">
          <CardContent className="pt-6"><p className="text-sm text-red-200">{error}</p></CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard title="Total Trades" value={String(summary.totalTrades)} accent="text-white" loading={dashboardLoading} />
        <SummaryCard title="Open Trades" value={String(summary.openTrades)} accent="text-sky-200" loading={dashboardLoading} />
        <SummaryCard title="Completed Trades" value={String(summary.completedTrades)} accent="text-emerald-300" loading={dashboardLoading} />
        <SummaryCard title="Total Volume" value={summary.totalVolume} accent="text-slate-100" loading={dashboardLoading} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <Card className="border-emerald-900/40 bg-zinc-950/70">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg text-white">
                <BarChart3 className="h-5 w-5 text-emerald-300" />
                Active Pair Market Summary
              </CardTitle>
              <CardDescription>Current selected pair for quick trading and lifecycle monitoring.</CardDescription>
            </CardHeader>
            <CardContent>
              {marketSummaryLoading && !marketSummary ? (
                <div className="grid gap-3 md:grid-cols-5">
                  {[0, 1, 2, 3, 4].map((item) => <div key={item} className="h-16 animate-pulse rounded-xl bg-zinc-900/80" />)}
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  <MetricPill label="Pair" value={marketSummary?.displaySymbol ?? quickPair} />
                  <MetricPill label="Last Price" value={marketSummary ? formatPrice(marketSummary.lastPrice) : "-"} />
                  <MetricPill
                    label="24h Change"
                    value={marketSummary ? formatPercent(marketSummary.changePercent) : "-"}
                    tone={marketSummary && Number.parseFloat(marketSummary.changePercent) >= 0 ? "text-emerald-300" : "text-red-300"}
                  />
                  <MetricPill
                    label="24h Range"
                    value={marketSummary ? `${formatPrice(marketSummary.lowPrice)} - ${formatPrice(marketSummary.highPrice)}` : "-"}
                  />
                  <MetricPill label="24h Volume" value={marketSummary ? formatCompact(marketSummary.quoteVolume) : "-"} />
                </div>
              )}
              {marketSummaryError ? (
                <p className="mt-3 text-xs text-amber-300">{marketSummaryError}</p>
              ) : (
                <p className="mt-3 text-xs text-slate-500">Last update {marketSummary ? formatDateTime(new Date(marketSummary.updatedAt).toISOString()) : "-"}</p>
              )}
            </CardContent>
          </Card>

          <Card className="overflow-hidden border-zinc-800 bg-zinc-950/65">
            <CardHeader>
              <CardTitle className="text-lg">Chart Area</CardTitle>
              <CardDescription>{toPairLabel(selectedMarketSymbol)} {CHART_INTERVAL} live stream with resilient fallback candles.</CardDescription>
            </CardHeader>
            <CardContent>
              {chartLoading && chartCandles.length === 0 ? (
                <div className="h-[380px] animate-pulse rounded-2xl bg-zinc-900/80" />
              ) : (
                <LightweightMarketChart
                  candles={chartCandles}
                  symbol={selectedMarketSymbol}
                  interval={CHART_INTERVAL}
                  currentPrice={marketSummary?.lastPrice ?? null}
                  streamState={chartStreamState}
                />
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="border-zinc-800 bg-zinc-950/60">
              <CardHeader>
                <CardTitle className="text-lg">Open Orders</CardTitle>
                <CardDescription>Lifecycle-stage trades still active in your queue.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {dashboardLoading ? (
                  [0, 1, 2].map((item) => <div key={item} className="h-12 animate-pulse rounded-xl bg-zinc-900/80" />)
                ) : openOrders.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-zinc-700 px-3 py-4 text-sm text-slate-400">No open orders right now.</p>
                ) : (
                  openOrders.map((trade) => {
                    const status = toDashboardStatus(trade.status);
                    const pair = toTradePair(trade);
                    const asset = trade.offer?.asset ?? "USDT";
                    return (
                      <div key={trade.id} className="rounded-xl border border-zinc-800 bg-zinc-950/70 px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium text-slate-100">{pair}</p>
                          <span className={`rounded-full border px-2 py-1 text-[11px] ${statusBadgeTone(status)}`}>{status}</span>
                        </div>
                        <p className="mt-1 text-xs text-slate-400">{formatMinorUnits(trade.amountMinor, asset)} · {formatRelativeTime(trade.createdAt ?? trade.openedAt)}</p>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>

            <Card className="border-zinc-800 bg-zinc-950/60">
              <CardHeader>
                <CardTitle className="text-lg">Open Positions</CardTitle>
                <CardDescription>Aggregated by pair and side for quick exposure view.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {dashboardLoading ? (
                  [0, 1, 2].map((item) => <div key={item} className="h-12 animate-pulse rounded-xl bg-zinc-900/80" />)
                ) : positionRows.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-zinc-700 px-3 py-4 text-sm text-slate-400">No active positions yet.</p>
                ) : (
                  positionRows.map((position) => (
                    <div key={position.key} className="rounded-xl border border-zinc-800 bg-zinc-950/70 px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-slate-100">{position.pair}</p>
                        <span className={`rounded-full border px-2 py-1 text-[11px] ${directionTone(position.direction)}`}>{position.direction}</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-400">{formatMinorUnits(position.amountMinor, position.asset)} · {position.tradeCount} trade(s)</p>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Quick Trade Actions</CardTitle>
              <CardDescription>Jump straight into buy/sell paths with selected pair context.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="inline-flex w-full rounded-xl border border-zinc-700 bg-zinc-950/70 p-1">
                <button onClick={() => setQuickSide("BUY")} className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${quickSide === "BUY" ? "bg-emerald-600 text-white" : "text-slate-300"}`}>Quick Buy</button>
                <button onClick={() => setQuickSide("SELL")} className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${quickSide === "SELL" ? "bg-red-600 text-white" : "text-slate-300"}`}>Quick Sell</button>
              </div>

              <label className="space-y-1.5">
                <span className="text-xs uppercase tracking-wide text-slate-500">Active Pair</span>
                <select value={quickPair} onChange={(event) => setQuickPair(event.target.value)} className="h-10 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500">
                  {pairOptions.map((pair) => <option key={pair} value={pair}>{pair}</option>)}
                </select>
              </label>

              <div className="grid gap-2">
                <Link href="/p2p"><Button className="w-full gap-2"><ArrowRightLeft className="h-4 w-4" />Start New Trade</Button></Link>
                <Link href="/demo-trading"><Button variant="outline" className="w-full">{quickSide} {quickPair}</Button></Link>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Wallet Summary</CardTitle>
              <CardDescription>Quick balances for active trading decisions.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-slate-300">
              <p>Available: <span className="font-semibold text-white">{wallet ? formatMinorUnits(wallet.availableBalanceMinor, wallet.currency) : "-"}</span></p>
              <p>Escrow: <span className="font-semibold text-white">{wallet ? formatMinorUnits(wallet.escrowBalanceMinor, wallet.currency) : "-"}</span></p>
              <Link href="/wallet"><Button variant="outline" className="mt-2 w-full">Open Wallet</Button></Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Recent Activity</CardTitle>
              <CardDescription>Latest lifecycle events across your account.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {dashboardLoading ? (
                [0, 1, 2].map((item) => <div key={item} className="h-10 animate-pulse rounded-xl bg-zinc-900/80" />)
              ) : recentActivity.length === 0 ? (
                <p className="rounded-xl border border-dashed border-zinc-700 px-3 py-4 text-sm text-slate-400">No recent activity yet.</p>
              ) : (
                recentActivity.map((trade) => {
                  const status = toDashboardStatus(trade.status);
                  const created = trade.createdAt ?? trade.openedAt;
                  return (
                    <div key={trade.id} className="rounded-xl border border-zinc-800 bg-zinc-950/70 px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-mono text-xs text-slate-200">{trade.id.slice(0, 12)}</p>
                        <span className={`rounded-full border px-2 py-1 text-[11px] ${statusBadgeTone(status)}`}>{status}</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-400">{toTradePair(trade)} · {formatRelativeTime(created)}</p>
                    </div>
                  );
                })
              )}
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
            className={`rounded-full border px-4 py-2 text-sm transition ${activeTab === tab ? "border-emerald-700/50 bg-emerald-500/10 text-emerald-200" : "border-zinc-700 bg-zinc-950 text-slate-300 hover:border-zinc-600"}`}
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
            <select value={pairFilter} onChange={(event) => setPairFilter(event.target.value)} className="h-10 rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500">
              <option value="ALL">All pairs</option>
              {pairOptions.map((pair) => <option key={pair} value={pair}>{pair}</option>)}
            </select>
          </div>

          {dashboardLoading ? (
            <div className="space-y-2 rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">{[0, 1, 2, 3].map((item) => <div key={item} className="h-12 animate-pulse rounded-lg bg-zinc-900/80" />)}</div>
          ) : null}

          {!dashboardLoading && filteredTrades.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-700 px-4 py-8 text-center">
              <p className="text-lg font-medium text-white">No trades yet</p>
              <p className="mt-2 text-sm text-slate-500">Your trade board is ready. Start your first trade to populate history.</p>
              <div className="mt-4"><Link href="/p2p"><Button>Start your first trade</Button></Link></div>
            </div>
          ) : null}

          {!dashboardLoading && filteredTrades.length > 0 ? (
            <>
              <div className="overflow-x-auto rounded-xl border border-zinc-800">
                <table className="min-w-full divide-y divide-zinc-800 text-sm">
                  <thead className="sticky top-0 bg-zinc-950/95 text-xs uppercase tracking-[0.12em] text-slate-500 backdrop-blur">
                    <tr>
                      <th className="px-4 py-3 text-left">Trade ID</th>
                      <th className="px-4 py-3 text-left">Pair</th>
                      <th className="px-4 py-3 text-left">Side</th>
                      <th className="px-4 py-3 text-left">Amount</th>
                      <th className="hidden px-4 py-3 text-left lg:table-cell">Price</th>
                      <th className="hidden px-4 py-3 text-left md:table-cell">Counterparty</th>
                      <th className="px-4 py-3 text-left">Status</th>
                      <th className="hidden px-4 py-3 text-left xl:table-cell">Created At</th>
                      <th className="px-4 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800 bg-zinc-950/40">
                    {paginatedTrades.map((trade) => {
                      const pair = toTradePair(trade);
                      const direction = toTradeDirection(trade, authenticatedUser.id);
                      const dashboardStatus = toDashboardStatus(trade.status);
                      const createdAt = trade.createdAt ?? trade.openedAt ?? null;
                      const asset = trade.offer?.asset ?? "USDT";
                      const fiat = trade.offer?.fiatCurrency ?? "INR";

                      return (
                        <tr key={trade.id} className="hover:bg-zinc-900/40">
                          <td className="px-4 py-3 font-mono text-xs text-slate-200">{trade.id.slice(0, 12)}</td>
                          <td className="px-4 py-3 text-slate-100">{pair}</td>
                          <td className="px-4 py-3"><span className={`rounded-full border px-2 py-1 text-xs font-medium ${directionTone(direction)}`}>{direction}</span></td>
                          <td className="px-4 py-3 text-slate-200">{formatMinorUnits(trade.amountMinor, asset)}</td>
                          <td className="hidden px-4 py-3 text-slate-200 lg:table-cell">{formatMinorUnits(trade.fiatPriceMinor, fiat)}</td>
                          <td className="hidden px-4 py-3 text-slate-200 md:table-cell">{toCounterpartyLabel(trade, authenticatedUser.id)}</td>
                          <td className="px-4 py-3"><span className={`rounded-full border px-2 py-1 text-xs font-medium ${statusBadgeTone(dashboardStatus)}`}>{dashboardStatus}</span></td>
                          <td className="hidden px-4 py-3 text-slate-300 xl:table-cell">{createdAt ? formatDateTime(createdAt) : "-"}</td>
                          <td className="px-4 py-3 text-right"><Link href={`/trades/${trade.id}`}><Button size="sm" variant="outline" className="gap-1.5"><ListChecks className="h-3.5 w-3.5" />View</Button></Link></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-400">
                <p>Page {currentPage} of {totalPages}</p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}>Previous</Button>
                  <Button variant="outline" size="sm" disabled={currentPage >= totalPages} onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}>Next</Button>
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

function SummaryCard({ title, value, accent, loading = false }: { title: string; value: string; accent: string; loading?: boolean }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardDescription>{title}</CardDescription></CardHeader>
      <CardContent>{loading ? <div className="h-7 w-24 animate-pulse rounded bg-zinc-800/90" /> : <p className={`text-xl font-semibold ${accent}`}>{value}</p>}</CardContent>
    </Card>
  );
}

function MetricPill({ label, value, tone = "text-white" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-sm font-semibold ${tone}`}>{value}</p>
    </div>
  );
}


