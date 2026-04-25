"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  Activity,
  Clock3,
  LineChart,
  PlayCircle,
  RefreshCw,
  ShieldCheck,
  WalletCards,
  Wifi,
  WifiOff,
  XCircle,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { tokenStore } from "@/lib/api";
import { friendlyErrorMessage } from "@/lib/errors";
import { formatMinorUnits } from "@/lib/money";
import {
  buildMarketSelectionPath,
  DEFAULT_SUPPORTED_MARKET_SYMBOLS,
  normalizeMarketSelection,
  normalizeMarketSymbol,
  shouldFallbackToDefaultMarketSymbol,
  withSelectedPair,
} from "@/lib/market-selection";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DepthChart } from "@/components/markets/depth-chart";
import { MarketChartShell } from "@/components/markets/market-chart-shell";
import { OrderBook } from "@/components/markets/order-book";
import { RecentTradesFeed } from "@/components/markets/recent-trades-feed";
import { LoadingState } from "@/components/ui/loading-state";
import {
  MARKET_TIMEFRAMES,
  marketsService,
  toMarketDataErrorMessage,
  type MarketCandle,
  type MarketOrderBookSnapshot,
  type MarketRecentTrade,
  type MarketTickerSnapshot,
} from "@/services/markets.service";
import { paperTradingService, type PaperTradingAccountSummary } from "@/services/paper-trading.service";
import { walletService, type WalletSummary } from "@/services/wallet.service";

const SCALE_FACTOR = 100000000n;
const LEVERAGE_OPTIONS = ["1", "2", "5", "10"] as const;
const TRACKED_SYMBOLS = [...DEFAULT_SUPPORTED_MARKET_SYMBOLS];
const ACCOUNT_INIT_TIMEOUT_MS = 8_000;
const DEFAULT_FALLBACK_PRICE = "75000";
const MARKET_INIT_TIMEOUT_MS = 6_000;
const DEFAULT_QUOTE_ASSET = "USDT";
const DEFAULT_BASE_ASSET = "BTC";
const BINANCE_DEPTH_LIMIT = 20;
const BINANCE_DEPTH_RECONNECT_MS = 2_000;
const REAL_WALLET_REFRESH_MS = 15_000;

const EMPTY_REAL_WALLET: WalletSummary = {
  currency: "USDT",
  availableBalanceMinor: "0",
  escrowBalanceMinor: "0",
  ledger: [],
};

function formatSigned(value: string) {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return value;
  return `${parsed >= 0 ? "+" : ""}${parsed.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  })}`;
}

function formatCompact(value: string | null | undefined) {
  if (!value) return "-";
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return value;
  return parsed.toLocaleString(undefined, {
    minimumFractionDigits: parsed >= 1 ? 2 : 4,
    maximumFractionDigits: parsed >= 1 ? 2 : 6,
  });
}

function pnlTone(value: string) {
  return Number.parseFloat(value) >= 0 ? "text-emerald-300" : "text-red-300";
}

function summarizeMarket(pair: MarketTickerSnapshot | null, markPrice?: string) {
  if (!pair) return "Waiting for live quote";
  return `${pair.displaySymbol} ${formatCompact(markPrice || pair.lastPrice)} USDT`;
}

function parseMinor(value: string) {
  return BigInt(value);
}

function multiplyScaled(left: bigint, right: bigint) {
  return (left * right) / SCALE_FACTOR;
}

function scaledToDecimalString(value: bigint, scale = 8) {
  const factor = 10n ** BigInt(scale);
  const negative = value < 0n;
  const absolute = negative ? value * -1n : value;
  const whole = absolute / factor;
  const fraction = (absolute % factor)
    .toString()
    .padStart(scale, "0")
    .replace(/0+$/, "");
  const sign = negative ? "-" : "";
  return fraction ? `${sign}${whole.toString()}.${fraction}` : `${sign}${whole.toString()}`;
}

function calculateDirectionalPnl(
  positionType: "LONG" | "SHORT",
  entryPriceMinor: bigint,
  currentPriceMinor: bigint,
  quantityAtomic: bigint,
) {
  const deltaMinor =
    positionType === "LONG" ? currentPriceMinor - entryPriceMinor : entryPriceMinor - currentPriceMinor;
  return multiplyScaled(deltaMinor, quantityAtomic);
}

function calculatePnlPercent(unrealizedPnlMinor: bigint, marginMinor: bigint) {
  if (marginMinor <= 0n) return "0";
  return scaledToDecimalString((unrealizedPnlMinor * 100n * 10000n) / marginMinor, 4);
}

function parseMarketDecimal(value: string) {
  const [whole = "0", fraction = ""] = value.trim().split(".");
  const paddedFraction = `${fraction}${"0".repeat(8)}`.slice(0, 8);
  return BigInt(whole) * SCALE_FACTOR + BigInt(paddedFraction || "0");
}

function applyMarkPriceToPaperAccount(
  summary: PaperTradingAccountSummary,
  symbol: string,
  markPrice: string,
): PaperTradingAccountSummary {
  let unrealizedTotalMinor = 0n;

  const positions = summary.positions.map((position) => {
    if (position.symbol !== symbol) {
      unrealizedTotalMinor += parseMinor(position.unrealizedPnlMinor);
      return position;
    }

    const currentPriceMinor = parseMarketDecimal(markPrice);
    const quantityAtomic = parseMinor(position.quantityAtomic);
    const entryPriceMinor = parseMinor(position.averageEntryPriceMinor);
    const marginMinor = parseMinor(position.marginMinor);
    const currentNotionalMinor = multiplyScaled(currentPriceMinor, quantityAtomic);
    const unrealizedPnlMinor = calculateDirectionalPnl(
      position.positionType,
      entryPriceMinor,
      currentPriceMinor,
      quantityAtomic,
    );

    unrealizedTotalMinor += unrealizedPnlMinor;

    return {
      ...position,
      currentPrice: scaledToDecimalString(currentPriceMinor),
      currentPriceMinor: currentPriceMinor.toString(),
      currentNotional: scaledToDecimalString(currentNotionalMinor),
      currentNotionalMinor: currentNotionalMinor.toString(),
      unrealizedPnl: scaledToDecimalString(unrealizedPnlMinor),
      unrealizedPnlMinor: unrealizedPnlMinor.toString(),
      unrealizedPnlPercent: calculatePnlPercent(unrealizedPnlMinor, marginMinor),
    };
  });

  const usedMarginMinor = parseMinor(summary.account.usedMarginMinor);
  const reservedOrderMarginMinor = parseMinor(summary.account.reservedOrderMarginMinor);
  const balanceMinor = parseMinor(summary.account.balanceMinor);
  const equityMinor = balanceMinor + usedMarginMinor + reservedOrderMarginMinor + unrealizedTotalMinor;

  return {
    ...summary,
    account: {
      ...summary.account,
      unrealizedPnl: scaledToDecimalString(unrealizedTotalMinor),
      unrealizedPnlMinor: unrealizedTotalMinor.toString(),
      equity: scaledToDecimalString(equityMinor),
      equityMinor: equityMinor.toString(),
    },
    positions,
  };
}

function deriveMarkPrice(orderBook: MarketOrderBookSnapshot | null, fallbackPrice: string | null) {
  if (orderBook?.bestBid && orderBook.bestAsk) {
    const bid = Number.parseFloat(orderBook.bestBid);
    const ask = Number.parseFloat(orderBook.bestAsk);
    if (Number.isFinite(bid) && Number.isFinite(ask) && ask >= bid) {
      return ((bid + ask) / 2).toString();
    }
  }

  if (orderBook?.bestBid) return orderBook.bestBid;
  if (orderBook?.bestAsk) return orderBook.bestAsk;
  return fallbackPrice;
}

function estimateLiquidation(referencePrice: string, leverage: string, positionType: "LONG" | "SHORT") {
  const price = Number.parseFloat(referencePrice);
  const leverageValue = Number.parseInt(leverage, 10);
  if (!Number.isFinite(price) || !Number.isFinite(leverageValue) || leverageValue <= 0) return "-";

  const maintenanceRate = 0.005;
  const liquidation =
    positionType === "LONG"
      ? price * (1 - 1 / leverageValue + maintenanceRate)
      : price * (1 + 1 / leverageValue - maintenanceRate);

  return formatCompact(String(liquidation));
}

function reasonLabel(reason: string | null) {
  if (!reason) return "-";
  return reason.replace(/_/g, " ");
}

function parseSymbolParts(symbol: string) {
  const normalized = symbol.toUpperCase();
  if (normalized.endsWith(DEFAULT_QUOTE_ASSET) && normalized.length > DEFAULT_QUOTE_ASSET.length) {
    return {
      baseAsset: normalized.slice(0, -DEFAULT_QUOTE_ASSET.length),
      quoteAsset: DEFAULT_QUOTE_ASSET,
    };
  }

  return {
    baseAsset: DEFAULT_BASE_ASSET,
    quoteAsset: DEFAULT_QUOTE_ASSET,
  };
}

function buildFallbackPairSnapshot(symbol: string): MarketTickerSnapshot {
  const now = Date.now();
  const { baseAsset, quoteAsset } = parseSymbolParts(symbol);

  return {
    symbol,
    baseAsset,
    quoteAsset,
    displaySymbol: `${baseAsset}/${quoteAsset}`,
    lastPrice: DEFAULT_FALLBACK_PRICE,
    openPrice: "74650",
    highPrice: "75880",
    lowPrice: "74210",
    priceChange: "350",
    priceChangePercent: "0.47",
    volume: "0",
    quoteVolume: "0",
    bidPrice: "74990",
    askPrice: "75010",
    tradeCount: 0,
    openTime: now - 86_400_000,
    closeTime: now,
    updatedAt: now,
    source: "binance",
    streaming: false,
  };
}

function intervalToMs(interval: (typeof MARKET_TIMEFRAMES)[number]) {
  if (interval === "1m") return 60_000;
  if (interval === "5m") return 300_000;
  if (interval === "15m") return 900_000;
  if (interval === "1h") return 3_600_000;
  if (interval === "4h") return 14_400_000;
  return 86_400_000;
}

function buildFallbackCandles(
  symbol: string,
  interval: (typeof MARKET_TIMEFRAMES)[number],
  basePrice = 75_000,
  length = 80,
): MarketCandle[] {
  const stepMs = intervalToMs(interval);
  const now = Date.now();
  const start = now - stepMs * length;

  return Array.from({ length }, (_, index) => {
    const openTime = start + index * stepMs;
    const closeTime = openTime + stepMs - 1;
    const wave = Math.sin(index / 5) * 220 + Math.cos(index / 9) * 110;
    const open = basePrice + wave;
    const close = open + Math.sin(index / 3) * 80;
    const high = Math.max(open, close) + 60;
    const low = Math.min(open, close) - 60;

    return {
      symbol,
      interval,
      openTime,
      closeTime,
      open: open.toFixed(2),
      high: high.toFixed(2),
      low: low.toFixed(2),
      close: close.toFixed(2),
      volume: (10 + (index % 12) * 0.7).toFixed(4),
      quoteVolume: ((10 + (index % 12) * 0.7) * close).toFixed(2),
      tradeCount: 40 + (index % 20),
      isClosed: true,
      updatedAt: now,
    };
  });
}

function buildFallbackPaperAccountSummary(): PaperTradingAccountSummary {
  const now = new Date().toISOString();

  return {
    account: {
      id: "fallback-paper-account",
      currency: DEFAULT_QUOTE_ASSET,
      balance: "10000.00000000",
      balanceMinor: "1000000000000",
      usedMargin: "0.00000000",
      usedMarginMinor: "0",
      reservedOrderMargin: "0.00000000",
      reservedOrderMarginMinor: "0",
      realizedPnl: "0.00000000",
      realizedPnlMinor: "0",
      unrealizedPnl: "0.00000000",
      unrealizedPnlMinor: "0",
      equity: "10000.00000000",
      equityMinor: "1000000000000",
      createdAt: now,
      updatedAt: now,
    },
    positions: [],
    orders: [],
    tradeHistory: [],
  };
}

function toBinanceSymbol(symbol: string) {
  return symbol.replace(/\//g, "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

function toDepthEntries(input: unknown) {
  if (!Array.isArray(input)) return [] as Array<[string, string]>;

  return input
    .map((entry) => {
      if (!Array.isArray(entry) || entry.length < 2) return null;
      const price = String(entry[0] ?? "").trim();
      const quantity = String(entry[1] ?? "").trim();
      if (!price || !quantity) return null;
      const priceValue = Number.parseFloat(price);
      const quantityValue = Number.parseFloat(quantity);
      if (!Number.isFinite(priceValue) || !Number.isFinite(quantityValue) || priceValue <= 0 || quantityValue <= 0) {
        return null;
      }
      return [price, quantity] as [string, string];
    })
    .filter((entry): entry is [string, string] => entry !== null);
}

function buildDepthLevels(
  side: "BID" | "ASK",
  levels: Array<[string, string]>,
) {
  const sorted = [...levels].sort((left, right) => {
    const leftPrice = Number.parseFloat(left[0]);
    const rightPrice = Number.parseFloat(right[0]);
    return side === "BID" ? rightPrice - leftPrice : leftPrice - rightPrice;
  });

  let cumulative = 0;
  return sorted.map(([price, quantity]) => {
    cumulative += Number.parseFloat(quantity);
    return {
      price,
      quantity,
      cumulativeQuantity: cumulative.toFixed(8),
      side,
    } as const;
  });
}

function buildDepthSnapshot(
  symbol: string,
  payload: { bids?: unknown; asks?: unknown },
  streaming: boolean,
): MarketOrderBookSnapshot {
  const bids = buildDepthLevels("BID", toDepthEntries(payload.bids));
  const asks = buildDepthLevels("ASK", toDepthEntries(payload.asks));
  const bestBid = bids[0]?.price ?? null;
  const bestAsk = asks[0]?.price ?? null;
  const spread =
    bestBid && bestAsk
      ? (
          Number.parseFloat(bestAsk) - Number.parseFloat(bestBid)
        ).toFixed(8).replace(/0+$/, "").replace(/\.$/, "")
      : null;

  return {
    symbol,
    bids,
    asks,
    bestBid,
    bestAsk,
    spread: spread && spread.length > 0 ? spread : null,
    updatedAt: Date.now(),
    source: "binance",
    streaming,
  };
}

function hasDepthLevels(snapshot: MarketOrderBookSnapshot | null | undefined) {
  if (!snapshot) return false;
  return snapshot.bids.length > 0 || snapshot.asks.length > 0;
}

function mergeOrderBookSnapshots(
  current: MarketOrderBookSnapshot | null,
  incoming: MarketOrderBookSnapshot,
) {
  if (hasDepthLevels(incoming)) {
    return incoming;
  }

  if (current?.symbol === incoming.symbol && hasDepthLevels(current)) {
    return {
      ...current,
      streaming: incoming.streaming,
      updatedAt: incoming.updatedAt,
    };
  }

  return incoming;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(errorMessage));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function DemoTradingPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString();
  const querySymbolParam = searchParams.get("symbol");
  const queryIntervalParam = searchParams.get("interval");
  const querySymbolCandidate = normalizeMarketSymbol(querySymbolParam, "");
  const initialSupportedSymbols = querySymbolCandidate
    ? [querySymbolCandidate, ...TRACKED_SYMBOLS]
    : TRACKED_SYMBOLS;
  const initialSelection = normalizeMarketSelection({
    symbol: querySymbolParam,
    interval: queryIntervalParam,
    supportedSymbols: initialSupportedSymbols,
    fallbackSymbol: TRACKED_SYMBOLS[0],
  });
  const bootSymbol = initialSelection.symbol;
  const bootInterval = initialSelection.interval;
  const { isAuthenticated, isBootstrapping } = useAuth();
  const [selectedSymbol, setSelectedSymbol] = useState(() =>
    initialSelection.symbol,
  );
  const [selectedInterval, setSelectedInterval] = useState<(typeof MARKET_TIMEFRAMES)[number]>(() =>
    initialSelection.interval,
  );
  const [marketPair, setMarketPair] = useState<MarketTickerSnapshot | null>(() =>
    buildFallbackPairSnapshot(initialSelection.symbol),
  );
  const [pairOptions, setPairOptions] = useState<MarketTickerSnapshot[]>(() =>
    withSelectedPair([buildFallbackPairSnapshot(initialSelection.symbol)], initialSelection.symbol),
  );
  const [candles, setCandles] = useState<MarketCandle[]>(() =>
    buildFallbackCandles(initialSelection.symbol, initialSelection.interval),
  );
  const [orderBook, setOrderBook] = useState<MarketOrderBookSnapshot | null>(null);
  const [recentTrades, setRecentTrades] = useState<MarketRecentTrade[]>([]);
  const [paperAccount, setPaperAccount] = useState<PaperTradingAccountSummary | null>(() =>
    buildFallbackPaperAccountSummary(),
  );
  const [accountMode, setAccountMode] = useState<"DEMO" | "REAL">("DEMO");
  const [realWallet, setRealWallet] = useState<WalletSummary | null>(null);
  const [realWalletError, setRealWalletError] = useState<string | null>(null);
  const [realWalletLoading, setRealWalletLoading] = useState(false);
  const [positionType, setPositionType] = useState<"LONG" | "SHORT">("LONG");
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [orderType, setOrderType] = useState<"MARKET" | "LIMIT">("MARKET");
  const [leverage, setLeverage] = useState<(typeof LEVERAGE_OPTIONS)[number]>("1");
  const [quantity, setQuantity] = useState("0.0100");
  const [limitPrice, setLimitPrice] = useState("");
  const [stopLossPrice, setStopLossPrice] = useState("");
  const [takeProfitPrice, setTakeProfitPrice] = useState("");
  const [riskDraft, setRiskDraft] = useState<Record<string, { stopLossPrice: string; takeProfitPrice: string }>>({});
  const [search, setSearch] = useState("");
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSocketConnected, setIsSocketConnected] = useState(false);
  const [isDepthSocketConnected, setIsDepthSocketConnected] = useState(false);
  const [restFallback, setRestFallback] = useState(false);
  const [depthFeedError, setDepthFeedError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isPageLoading, setIsPageLoading] = useState(true);
  const [accountMissing, setAccountMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const deferredSearch = useDeferredValue(search);

  const pendingOrders = useMemo(
    () => paperAccount?.orders.filter((order) => order.status === "OPEN") ?? [],
    [paperAccount],
  );
  const orderHistory = useMemo(
    () => paperAccount?.orders.filter((order) => order.status !== "OPEN") ?? [],
    [paperAccount],
  );

  const watchedSymbols = useMemo(() => {
    const tracked = new Set<string>([selectedSymbol]);
    paperAccount?.positions.forEach((position) => tracked.add(position.symbol));
    pendingOrders.forEach((order) => tracked.add(order.symbol));
    return [...tracked];
  }, [paperAccount, pendingOrders, selectedSymbol]);

  const markReferencePrice = useMemo(
    () => deriveMarkPrice(orderBook, marketPair?.lastPrice ?? null) ?? "",
    [marketPair?.lastPrice, orderBook],
  );
  const realWalletSummary = realWallet ?? EMPTY_REAL_WALLET;
  const realAvailableMinor = BigInt(realWalletSummary.availableBalanceMinor || "0");
  const realEscrowMinor = BigInt(realWalletSummary.escrowBalanceMinor || "0");
  const realTotalMinor = realAvailableMinor + realEscrowMinor;
  const realHasFunds = realAvailableMinor > 0n;
  const referencePrice = orderType === "LIMIT" && limitPrice ? limitPrice : markReferencePrice;

  const estimatedNotional = useMemo(() => {
    const price = Number.parseFloat(referencePrice);
    const qty = Number.parseFloat(quantity);
    if (!Number.isFinite(price) || !Number.isFinite(qty)) return "0";
    return formatCompact(String(price * qty));
  }, [quantity, referencePrice]);

  const estimatedMargin = useMemo(() => {
    const price = Number.parseFloat(referencePrice);
    const qty = Number.parseFloat(quantity);
    const leverageValue = Number.parseInt(leverage, 10);
    if (!Number.isFinite(price) || !Number.isFinite(qty) || !Number.isFinite(leverageValue)) return "0";
    return formatCompact(String((price * qty) / leverageValue));
  }, [leverage, quantity, referencePrice]);
  const tradingBalance = useMemo(() => {
    if (accountMode === "REAL") {
      return Number(realAvailableMinor) / 100;
    }
    return Number.parseFloat(paperAccount?.account.balance ?? "0");
  }, [accountMode, paperAccount?.account.balance, realAvailableMinor]);
  const maxQuantityForSelectedLeverage = useMemo(() => {
    const balance = tradingBalance;
    const price = Number.parseFloat(referencePrice);
    const leverageValue = Number.parseInt(leverage, 10);
    if (!Number.isFinite(balance) || !Number.isFinite(price) || !Number.isFinite(leverageValue)) return 0;
    if (balance <= 0 || price <= 0 || leverageValue <= 0) return 0;
    return (balance * leverageValue) / price;
  }, [leverage, referencePrice, tradingBalance]);
  const estimatedLiquidationPrice = useMemo(
    () => estimateLiquidation(referencePrice, leverage, positionType),
    [leverage, positionType, referencePrice],
  );
  const riskDistancePercent = useMemo(() => {
    const reference = Number.parseFloat(referencePrice);
    const liquidation = Number.parseFloat(estimatedLiquidationPrice);
    if (!Number.isFinite(reference) || !Number.isFinite(liquidation) || reference <= 0 || liquidation <= 0) {
      return null;
    }

    if (positionType === "LONG") {
      return ((reference - liquidation) / reference) * 100;
    }
    return ((liquidation - reference) / reference) * 100;
  }, [estimatedLiquidationPrice, positionType, referencePrice]);
  const riskToneClass =
    riskDistancePercent === null
      ? "text-slate-400"
      : riskDistancePercent < 2
        ? "text-red-300"
        : riskDistancePercent < 5
          ? "text-amber-300"
          : "text-emerald-300";
  const normalizedSupportedSymbols = useMemo(() => {
    const symbols = new Set<string>(TRACKED_SYMBOLS);
    pairOptions.forEach((pair) => symbols.add(pair.symbol));
    symbols.add(selectedSymbol);
    if (querySymbolCandidate) {
      symbols.add(querySymbolCandidate);
    }
    return [...symbols];
  }, [pairOptions, querySymbolCandidate, selectedSymbol]);
  const querySelection = useMemo(
    () =>
      normalizeMarketSelection({
        symbol: querySymbolParam,
        interval: queryIntervalParam,
        supportedSymbols: normalizedSupportedSymbols,
        fallbackSymbol: TRACKED_SYMBOLS[0],
      }),
    [normalizedSupportedSymbols, queryIntervalParam, querySymbolParam],
  );
  const currentPathWithQuery = searchParamsString ? `${pathname}?${searchParamsString}` : pathname;
  const targetSelectionPath = useMemo(
    () => buildMarketSelectionPath(pathname, selectedSymbol, selectedInterval, searchParamsString),
    [pathname, searchParamsString, selectedInterval, selectedSymbol],
  );
  const isSelectionSynced =
    querySelection.symbol === selectedSymbol && querySelection.interval === selectedInterval;

  useEffect(() => {
    setError(null);
    if (accountMode === "REAL") {
      setAccountMissing(false);
    }
  }, [accountMode]);

  useEffect(() => {
    setSelectedSymbol((current) =>
      current === querySelection.symbol ? current : querySelection.symbol,
    );
    setSelectedInterval((current) =>
      current === querySelection.interval ? current : querySelection.interval,
    );
  }, [querySelection.interval, querySelection.symbol]);

  useEffect(() => {
    if (targetSelectionPath === currentPathWithQuery) {
      return;
    }
    router.replace(targetSelectionPath, { scroll: false });
  }, [currentPathWithQuery, router, targetSelectionPath]);

  useEffect(() => {
    setMarketPair((current) => (current?.symbol === selectedSymbol ? current : buildFallbackPairSnapshot(selectedSymbol)));
    setPairOptions((current) => {
      if (current.some((pair) => pair.symbol === selectedSymbol)) {
        return withSelectedPair(current, selectedSymbol);
      }
      return withSelectedPair([...current, buildFallbackPairSnapshot(selectedSymbol)], selectedSymbol);
    });
    setCandles((current) => {
      const hasCurrentPairCandles = current.some(
        (candle) => candle.symbol === selectedSymbol && candle.interval === selectedInterval,
      );
      return hasCurrentPairCandles ? current : buildFallbackCandles(selectedSymbol, selectedInterval);
    });
  }, [selectedInterval, selectedSymbol]);

  async function refreshAccount(options?: { autoCreateIfMissing?: boolean }) {
    const token = tokenStore.accessToken;
    if (!token) {
      setAccountMissing(true);
      setPaperAccount((current) => current ?? buildFallbackPaperAccountSummary());
      setError("Session token unavailable. Showing fallback demo state.");
      setLoading(false);
      return;
    }

    try {
      const summary = await withTimeout(
        paperTradingService.getAccount(token),
        ACCOUNT_INIT_TIMEOUT_MS,
        "Timed out while loading demo account.",
      );
      setPaperAccount(summary);
      setAccountMissing(false);
      setError(null);
    } catch (err) {
      const rawMessage = err instanceof Error ? err.message : String(err ?? "");
      const normalized = rawMessage.toLowerCase();
      const safeMessage = friendlyErrorMessage(err, "Unable to load your demo account right now.");
      const missingAccount = normalized.includes("not found") || normalized.includes("404");

      if (missingAccount && options?.autoCreateIfMissing) {
        try {
          const created = await withTimeout(
            paperTradingService.createAccount(token),
            ACCOUNT_INIT_TIMEOUT_MS,
            "Timed out while creating demo account.",
          );
          setPaperAccount(created);
          setAccountMissing(false);
          setError(null);
          return;
        } catch (createError) {
          setAccountMissing(true);
          setPaperAccount((current) => current ?? buildFallbackPaperAccountSummary());
          setError(friendlyErrorMessage(createError, "Unable to create your demo account right now."));
          return;
        }
      }

      if (missingAccount) {
        setAccountMissing(true);
        setPaperAccount((current) => current ?? buildFallbackPaperAccountSummary());
        setError(null);
      } else {
        setError(safeMessage);
        setPaperAccount((current) => current ?? buildFallbackPaperAccountSummary());
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    const releaseLoading = window.setTimeout(() => {
      if (active) {
        setIsPageLoading(false);
      }
    }, 1000);

    const initTradeDesk = async () => {
      try {
        const marketTasks = await Promise.allSettled([
          withTimeout(
            marketsService.getOverview([bootSymbol]),
            MARKET_INIT_TIMEOUT_MS,
            "Timed out while loading market overview.",
          ),
          withTimeout(
            marketsService.getCandles(bootSymbol, bootInterval, 120),
            MARKET_INIT_TIMEOUT_MS,
            "Timed out while loading initial candles.",
          ),
        ]);

        if (!active) return;

        const [overviewResult, candlesResult] = marketTasks;

        if (overviewResult.status === "fulfilled") {
          const livePair = overviewResult.value.pairs[0] ?? buildFallbackPairSnapshot(bootSymbol);
          setMarketPair(livePair);
          setPairOptions((current) => {
            const map = new Map(current.map((pair) => [pair.symbol, pair]));
            map.set(livePair.symbol, livePair);
            return withSelectedPair([...map.values()].slice(0, 20), bootSymbol);
          });
          setRestFallback(!overviewResult.value.streaming);
        } else {
          setRestFallback(true);
          setError(
            (previous) =>
              previous ??
              toMarketDataErrorMessage(overviewResult.reason, "Unable to load market data."),
          );
        }

        if (candlesResult.status === "fulfilled") {
          setCandles(
            candlesResult.value.candles.length > 0
              ? candlesResult.value.candles
              : buildFallbackCandles(bootSymbol, bootInterval),
          );
        } else {
          setCandles(buildFallbackCandles(bootSymbol, bootInterval));
          setRestFallback(true);
        }
      } catch (err) {
        if (!active) return;
        console.error("Trade desk init failed:", err);
        setRestFallback(true);
        setPaperAccount((current) => current ?? buildFallbackPaperAccountSummary());
        setError(toMarketDataErrorMessage(err, "Unable to load market data."));
      } finally {
        if (active) {
          setIsPageLoading(false);
        }
      }
    };

    void initTradeDesk();

    return () => {
      active = false;
      clearTimeout(releaseLoading);
    };
  }, [bootInterval, bootSymbol]);

  useEffect(() => {
    let cancelled = false;

    async function loadMarketPanel() {
      try {
        const [searchResponse, overview, candleResponse, orderBookResponse, recentTradesResponse] = await Promise.all([
          marketsService.searchPairs(deferredSearch, 16),
          marketsService.getOverview([selectedSymbol]),
          marketsService.getCandles(selectedSymbol, selectedInterval),
          marketsService.getOrderBook(selectedSymbol, 20),
          marketsService.getRecentTrades(selectedSymbol, 80),
        ]);

        if (cancelled) return;

        const pairMap = new Map<string, MarketTickerSnapshot>();
        searchResponse.pairs.forEach((pair) => pairMap.set(pair.symbol, pair));
        overview.pairs.forEach((pair) => pairMap.set(pair.symbol, pair));
        pairMap.set(selectedSymbol, overview.pairs[0] ?? buildFallbackPairSnapshot(selectedSymbol));
        setPairOptions(withSelectedPair([...pairMap.values()].slice(0, 20), selectedSymbol));
        setMarketPair(overview.pairs[0] ?? buildFallbackPairSnapshot(selectedSymbol));
        setCandles(
          candleResponse.candles.length > 0
            ? candleResponse.candles
            : buildFallbackCandles(selectedSymbol, selectedInterval),
        );
        setOrderBook((current) => mergeOrderBookSnapshots(current, orderBookResponse.orderBook));
        setRecentTrades(recentTradesResponse.trades);
        setRestFallback(!overview.streaming);
      } catch (err) {
        if (!cancelled) {
          const message = toMarketDataErrorMessage(err, "Unable to load market data.");
          if (shouldFallbackToDefaultMarketSymbol(message)) {
            setSelectedSymbol((current) => (current === TRACKED_SYMBOLS[0] ? current : TRACKED_SYMBOLS[0]));
          }
          setMarketPair((current) => current ?? buildFallbackPairSnapshot(selectedSymbol));
          setCandles((current) =>
            current.length > 0 ? current : buildFallbackCandles(selectedSymbol, selectedInterval),
          );
          setPairOptions((current) => withSelectedPair(current, selectedSymbol));
          setRestFallback(true);
          setError(message);
        }
      }
    }

    void loadMarketPanel();

    return () => {
      cancelled = true;
    };
  }, [deferredSearch, selectedInterval, selectedSymbol]);

  useEffect(() => {
    const exchangeSymbol = toBinanceSymbol(selectedSymbol);
    if (!exchangeSymbol) return;

    let active = true;
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    setOrderBook((current) =>
      current?.symbol === exchangeSymbol
        ? current
        : buildDepthSnapshot(exchangeSymbol, { bids: [], asks: [] }, false),
    );

    const applyDepthSnapshot = (snapshot: MarketOrderBookSnapshot) => {
      setOrderBook((current) => mergeOrderBookSnapshots(current, snapshot));
    };

    const markDepthStreamState = (connected: boolean) => {
      setIsDepthSocketConnected(connected);
      setOrderBook((current) =>
        current?.symbol === exchangeSymbol
          ? {
              ...current,
              streaming: connected,
              updatedAt: Date.now(),
            }
          : current,
      );
    };

    const fetchDepthSnapshot = async () => {
      const response = await fetch(
        `https://api.binance.com/api/v3/depth?symbol=${exchangeSymbol}&limit=${BINANCE_DEPTH_LIMIT}`,
        {
          cache: "no-store",
        },
      );

      if (!response.ok) {
        throw new Error(`Depth snapshot request failed (${response.status})`);
      }

      const payload = (await response.json()) as { bids?: unknown; asks?: unknown };
      if (!active) return;

      applyDepthSnapshot(buildDepthSnapshot(exchangeSymbol, payload, false));
      setDepthFeedError(null);
    };

    const connectDepthSocket = () => {
      if (!active) return;

      socket = new WebSocket(`wss://stream.binance.com:9443/ws/${exchangeSymbol.toLowerCase()}@depth20@100ms`);

      socket.onopen = () => {
        if (!active) return;
        setDepthFeedError(null);
        markDepthStreamState(true);
      };

      socket.onmessage = (event) => {
        if (!active) return;

        try {
          const payload = JSON.parse(event.data) as { bids?: unknown; asks?: unknown };
          applyDepthSnapshot(buildDepthSnapshot(exchangeSymbol, payload, true));
          setDepthFeedError(null);
          setIsDepthSocketConnected(true);
        } catch (error) {
          console.error("Failed to parse Binance depth message:", error);
        }
      };

      socket.onerror = (event) => {
        if (!active) return;
        console.error("Binance depth websocket error:", event);
        setDepthFeedError("Depth stream error. Reconnecting...");
      };

      socket.onclose = () => {
        if (!active) return;
        markDepthStreamState(false);
        reconnectTimer = setTimeout(() => {
          void bootstrapDepthFeed();
        }, BINANCE_DEPTH_RECONNECT_MS);
      };
    };

    const bootstrapDepthFeed = async () => {
      try {
        await fetchDepthSnapshot();
      } catch (error) {
        if (!active) return;
        console.error("Failed to fetch Binance depth snapshot:", error);
        setDepthFeedError(friendlyErrorMessage(error, "Live depth feed is temporarily unavailable."));
      }

      if (active) {
        connectDepthSocket();
      }
    };

    void bootstrapDepthFeed();

    return () => {
      active = false;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      if (socket) {
        socket.close();
      }
      setIsDepthSocketConnected(false);
    };
  }, [selectedSymbol]);

  useEffect(() => {
    const connection = marketsService.connectSocket({
      onConnect(connected) {
        setIsSocketConnected(connected);
        setRestFallback(connected ? false : true);
      },
      onTicker(ticker) {
        if (ticker.symbol === selectedSymbol) {
          setMarketPair(ticker);
        }

        setPairOptions((current) => {
          const map = new Map(current.map((pair) => [pair.symbol, pair]));
          map.set(ticker.symbol, ticker);
          return withSelectedPair([...map.values()].slice(0, 20), selectedSymbol);
        });

        setPaperAccount((current) =>
          current ? applyMarkPriceToPaperAccount(current, ticker.symbol, ticker.lastPrice) : current,
        );
      },
      onCandle(candle) {
        if (candle.symbol !== selectedSymbol || candle.interval !== selectedInterval) return;
        setCandles((current) => {
          const next = [...current];
          const index = next.findIndex((entry) => entry.openTime === candle.openTime);
          if (index >= 0) next[index] = candle;
          else next.push(candle);
          return next.slice(-160);
        });
      },
      onCandlesBootstrap(payload) {
        if (payload.symbol === selectedSymbol && payload.interval === selectedInterval) {
          setCandles(payload.candles);
        }
      },
      onOrderBookBootstrap(payload) {
        if (payload.symbol === selectedSymbol) {
          setOrderBook((current) => mergeOrderBookSnapshots(current, payload.orderBook));
        }
      },
      onOrderBook(nextOrderBook) {
        if (nextOrderBook.symbol === selectedSymbol) {
          setOrderBook((current) => mergeOrderBookSnapshots(current, nextOrderBook));
        }
        const markPrice = deriveMarkPrice(nextOrderBook, null);
        if (!markPrice) return;
        setPaperAccount((current) =>
          current ? applyMarkPriceToPaperAccount(current, nextOrderBook.symbol, markPrice) : current,
        );
      },
      onTradesBootstrap(payload) {
        if (payload.symbol === selectedSymbol) {
          setRecentTrades(payload.trades);
        }
      },
      onTrade(trade) {
        if (trade.symbol !== selectedSymbol) return;
        setRecentTrades((current) => [trade, ...current.filter((entry) => entry.tradeId !== trade.tradeId)].slice(0, 80));
      },
    });

    connection.watchSymbols(watchedSymbols);
    connection.watchCandles(selectedSymbol, selectedInterval);
    connection.watchOrderBook(selectedSymbol);
    connection.watchRecentTrades(selectedSymbol, 80);

    return () => {
      connection.unwatchSymbols(watchedSymbols);
      connection.unwatchCandles(selectedSymbol, selectedInterval);
      connection.unwatchOrderBook(selectedSymbol);
      connection.unwatchRecentTrades(selectedSymbol);
      connection.disconnect();
    };
  }, [selectedInterval, selectedSymbol, watchedSymbols]);

  useEffect(() => {
    if (isSocketConnected) return;

    const interval = window.setInterval(() => {
      void (async () => {
        try {
          const [overview, candleResponse, orderBookResponse, recentTradesResponse] = await Promise.all([
            marketsService.getOverview([selectedSymbol]),
            marketsService.getCandles(selectedSymbol, selectedInterval, 160),
            marketsService.getOrderBook(selectedSymbol, 20),
            marketsService.getRecentTrades(selectedSymbol, 80),
          ]);

          setMarketPair(overview.pairs[0] ?? buildFallbackPairSnapshot(selectedSymbol));
          setCandles(
            candleResponse.candles.length > 0
              ? candleResponse.candles
              : buildFallbackCandles(selectedSymbol, selectedInterval),
          );
          setOrderBook((current) => mergeOrderBookSnapshots(current, orderBookResponse.orderBook));
          setRecentTrades(recentTradesResponse.trades);
          setRestFallback(true);
        } catch {
          setRestFallback(true);
        }
      })();
    }, 12_000);

    return () => window.clearInterval(interval);
  }, [isSocketConnected, selectedInterval, selectedSymbol]);

  useEffect(() => {
    if (!isAuthenticated) {
      if (!isBootstrapping) {
        setLoading(false);
      }
      return;
    }

    if (accountMode !== "DEMO") {
      setLoading(false);
      return;
    }

    setLoading(true);
    void refreshAccount({ autoCreateIfMissing: true });
  }, [accountMode, isAuthenticated, isBootstrapping]);

  useEffect(() => {
    if (accountMode !== "DEMO" || !isAuthenticated || accountMissing || !paperAccount) return;

    const timer = setInterval(() => {
      void refreshAccount();
    }, 8000);

    return () => clearInterval(timer);
  }, [accountMissing, accountMode, isAuthenticated, paperAccount]);

  useEffect(() => {
    if (!isAuthenticated || isBootstrapping || accountMode !== "REAL") {
      return;
    }

    let active = true;

    const loadRealWallet = async () => {
      setRealWalletLoading(true);
      try {
        const token = tokenStore.accessToken;
        if (!token) {
          if (!active) return;
          setRealWallet(EMPTY_REAL_WALLET);
          setRealWalletError("Real wallet session is unavailable. Showing safe zero-balance wallet state.");
          return;
        }

        const payload = await walletService.getWallet(token);
        if (!active) return;
        setRealWallet({
          currency: payload?.currency || "USDT",
          availableBalanceMinor: payload?.availableBalanceMinor || "0",
          escrowBalanceMinor: payload?.escrowBalanceMinor || "0",
          walletId: payload?.walletId,
          depositAddresses: payload?.depositAddresses,
          ledger: payload?.ledger ?? [],
        });
        setRealWalletError(null);
      } catch (err) {
        if (!active) return;
        setRealWallet((current) => current ?? EMPTY_REAL_WALLET);
        setRealWalletError(friendlyErrorMessage(err, "Unable to refresh your real wallet right now."));
      } finally {
        if (active) {
          setRealWalletLoading(false);
        }
      }
    };

    void loadRealWallet();
    const timer = window.setInterval(() => {
      void loadRealWallet();
    }, REAL_WALLET_REFRESH_MS);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [accountMode, isAuthenticated, isBootstrapping]);

  async function handleCreateAccount() {
    if (accountMode !== "DEMO") {
      return;
    }
    const token = tokenStore.accessToken;
    if (!token) return;

    setIsCreatingAccount(true);
    setError(null);

    try {
      const summary = await paperTradingService.createAccount(token);
      setPaperAccount(summary);
      setAccountMissing(false);
    } catch (err) {
      setError(friendlyErrorMessage(err, "Unable to initialize your demo account right now."));
    } finally {
      setIsCreatingAccount(false);
    }
  }

  async function handleSubmitOrder() {
    if (accountMode === "REAL") {
      if (!realHasFunds) {
        setError("No real funds available. Deposit funds to trade.");
        return;
      }
      router.push("/trade");
      return;
    }

    const token = tokenStore.accessToken;
    if (!token) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const summary = await paperTradingService.placeOrder(token, {
        symbol: selectedSymbol,
        positionType,
        side,
        orderType,
        leverage,
        quantity,
        limitPrice: orderType === "LIMIT" ? limitPrice : undefined,
        stopLossPrice: stopLossPrice || undefined,
        takeProfitPrice: takeProfitPrice || undefined,
      });
      setPaperAccount(summary);
      if (orderType === "LIMIT") {
        setLimitPrice("");
      }
    } catch (err) {
      setError(friendlyErrorMessage(err, "Unable to place this demo order right now."));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleClosePosition(symbol: string) {
    if (accountMode !== "DEMO") {
      return;
    }
    const token = tokenStore.accessToken;
    if (!token) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const summary = await paperTradingService.closePosition(token, symbol);
      setPaperAccount(summary);
    } catch (err) {
      setError(friendlyErrorMessage(err, "Unable to close this demo position right now."));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCancelOrder(orderId: string) {
    if (accountMode !== "DEMO") {
      return;
    }
    const token = tokenStore.accessToken;
    if (!token) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const summary = await paperTradingService.cancelOrder(token, orderId);
      setPaperAccount(summary);
    } catch (err) {
      setError(friendlyErrorMessage(err, "Unable to cancel this demo order right now."));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleUpdateRisk(symbol: string, positionId: string) {
    if (accountMode !== "DEMO") {
      return;
    }
    const token = tokenStore.accessToken;
    if (!token) return;

    const draft = riskDraft[positionId];
    const stopLoss = draft?.stopLossPrice?.trim() ?? "";
    const takeProfit = draft?.takeProfitPrice?.trim() ?? "";
    if (!stopLoss && !takeProfit) {
      setError("Provide stop loss and/or take profit before updating.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const summary = await paperTradingService.updatePositionRisk(token, symbol, {
        stopLossPrice: stopLoss || undefined,
        takeProfitPrice: takeProfit || undefined,
      });
      setPaperAccount(summary);
    } catch (err) {
      setError(friendlyErrorMessage(err, "Unable to update stop loss/take profit right now."));
    } finally {
      setIsSubmitting(false);
    }
  }

  function syncPositionType(nextType: "LONG" | "SHORT") {
    setPositionType(nextType);
    setSide(nextType === "LONG" ? "BUY" : "SELL");
  }

  function getRiskDraft(position: PaperTradingAccountSummary["positions"][number]) {
    const current = riskDraft[position.id];
    return {
      stopLossPrice: current?.stopLossPrice ?? position.stopLossPrice ?? "",
      takeProfitPrice: current?.takeProfitPrice ?? position.takeProfitPrice ?? "",
    };
  }

  function updateRiskDraft(
    positionId: string,
    field: "stopLossPrice" | "takeProfitPrice",
    value: string,
  ) {
    setRiskDraft((current) => ({
      ...current,
      [positionId]: {
        stopLossPrice: field === "stopLossPrice" ? value : current[positionId]?.stopLossPrice ?? "",
        takeProfitPrice: field === "takeProfitPrice" ? value : current[positionId]?.takeProfitPrice ?? "",
      },
    }));
  }

  function handleQuickQuantityFill(percent: number) {
    if (maxQuantityForSelectedLeverage <= 0) {
      return;
    }

    const nextQuantity = (maxQuantityForSelectedLeverage * percent) / 100;
    const precision = nextQuantity >= 1 ? 4 : 6;
    const sanitized = nextQuantity.toFixed(precision).replace(/0+$/, "").replace(/\.$/, "");
    setQuantity(sanitized || "0");
  }

  function getPositionRiskTone(position: PaperTradingAccountSummary["positions"][number]) {
    const currentPrice = Number.parseFloat(position.currentPrice);
    const liquidationPrice = Number.parseFloat(position.liquidationPrice ?? "");
    if (!Number.isFinite(currentPrice) || !Number.isFinite(liquidationPrice) || currentPrice <= 0) {
      return {
        label: "RISK: --",
        className: "text-slate-400",
      };
    }

    const distancePercent =
      position.positionType === "LONG"
        ? ((currentPrice - liquidationPrice) / currentPrice) * 100
        : ((liquidationPrice - currentPrice) / currentPrice) * 100;

    if (distancePercent < 2) {
      return { label: `RISK: HIGH (${distancePercent.toFixed(2)}%)`, className: "text-red-300" };
    }
    if (distancePercent < 5) {
      return { label: `RISK: MED (${distancePercent.toFixed(2)}%)`, className: "text-amber-300" };
    }
    return { label: `RISK: LOW (${distancePercent.toFixed(2)}%)`, className: "text-emerald-300" };
  }

  if (isPageLoading && !paperAccount) {
    return <LoadingState label="Preparing demo trading workspace" />;
  }

  if (!isAuthenticated && !isBootstrapping) {
    return (
      <section className="space-y-4">
        <h1 className="text-3xl font-semibold text-white">Demo Trading</h1>
        <p className="text-sm text-slate-400">Log in to create and use your paper trading account.</p>
        <Link href="/login">
          <Button>Go to login</Button>
        </Link>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-emerald-300">Xorviqa Trading Workspace</p>
            <h1 className="text-3xl font-semibold text-white">
              {accountMode === "DEMO" ? "Demo Trading Desk" : "Real Account Preview"}
            </h1>
          </div>
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs ${
              isSocketConnected
                ? "border-emerald-700/40 bg-emerald-500/10 text-emerald-200"
                : "border-amber-700/40 bg-amber-500/10 text-amber-200"
            }`}
          >
            {isSocketConnected ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
            {isSocketConnected ? "LIVE" : "RECONNECTING"}
          </span>
        </div>
        <div className="inline-flex rounded-xl border border-zinc-700 bg-zinc-950/70 p-1">
          <button
            onClick={() => setAccountMode("DEMO")}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              accountMode === "DEMO" ? "bg-emerald-600 text-white" : "text-slate-300"
            }`}
          >
            Demo Account
          </button>
          <button
            onClick={() => setAccountMode("REAL")}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              accountMode === "REAL" ? "bg-emerald-600 text-white" : "text-slate-300"
            }`}
          >
            Real Account
          </button>
        </div>
        <p className="text-sm text-slate-400">
          {accountMode === "DEMO"
            ? "Demo mode uses virtual funds only. Real wallet balances are never changed."
            : "Real mode reads your actual wallet balance only. Demo funds are completely excluded."}
        </p>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span
            className={`rounded-full border px-2.5 py-1 ${
              accountMode === "DEMO"
                ? "border-emerald-700/40 bg-emerald-500/10 text-emerald-200"
                : "border-sky-700/40 bg-sky-500/10 text-sky-200"
            }`}
          >
            {accountMode === "DEMO" ? "Demo funds" : "Real wallet"}
          </span>
          {loading && accountMode === "DEMO" ? (
            <span className="text-slate-500">Syncing demo account in the background...</span>
          ) : null}
          {realWalletLoading && accountMode === "REAL" ? (
            <span className="text-slate-500">Refreshing real wallet balance...</span>
          ) : null}
        </div>
      </header>

      {error ? (
        <Card className="border-red-700/30 bg-red-950/20">
          <CardContent className="pt-6">
            <p className="text-sm text-red-200">{error}</p>
          </CardContent>
        </Card>
      ) : null}

      {accountMode === "DEMO" && accountMissing ? (
        <Card className="border-emerald-900/50 bg-gradient-to-br from-emerald-950/40 via-zinc-950 to-zinc-900">
          <CardContent className="space-y-4 pt-6">
            <div className="flex items-start gap-3">
              <div className="rounded-xl border border-emerald-700/40 bg-emerald-500/10 p-2">
                <PlayCircle className="h-5 w-5 text-emerald-300" />
              </div>
              <div className="space-y-2">
                <p className="text-lg font-semibold text-white">Create your demo account</p>
                <p className="text-sm text-slate-400">
                  You&apos;ll start with 100,000 virtual USDT and can simulate leveraged long or short trades with live market prices.
                </p>
              </div>
            </div>
            <Button onClick={() => void handleCreateAccount()} disabled={isCreatingAccount} className="gap-2">
              <WalletCards className="h-4 w-4" />
              {isCreatingAccount ? "Creating..." : "Create Demo Account"}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {accountMode === "REAL" ? (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <SummaryCard
              title="Available (Real Wallet)"
              value={formatMinorUnits(realAvailableMinor.toString(), realWalletSummary.currency)}
              accent="text-white"
            />
            <SummaryCard
              title="Escrow (Real Wallet)"
              value={formatMinorUnits(realEscrowMinor.toString(), realWalletSummary.currency)}
              accent="text-slate-100"
            />
            <SummaryCard
              title="Total (Real Wallet)"
              value={formatMinorUnits(realTotalMinor.toString(), realWalletSummary.currency)}
              accent="text-emerald-300"
            />
          </div>

          {realWalletError ? (
            <Card className="border-amber-700/30 bg-amber-950/20">
              <CardContent className="pt-6">
                <p className="text-sm text-amber-200">
                  Real wallet sync is delayed. Showing last known wallet snapshot.
                </p>
                <p className="mt-1 text-xs text-amber-300/80">{realWalletError}</p>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Real Account Trading</CardTitle>
              <CardDescription>
                Real mode uses your actual wallet only. Demo balance is not available in this mode.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!realHasFunds ? (
                <div className="rounded-xl border border-dashed border-zinc-700 px-4 py-6 text-sm text-slate-400">
                  <p className="text-base font-medium text-white">No real funds available. Deposit funds to trade.</p>
                  <p className="mt-2">No funds yet. Deposit funds to start trading.</p>
                </div>
              ) : (
                <div className="rounded-xl border border-emerald-700/30 bg-emerald-950/20 px-4 py-4 text-sm text-emerald-100">
                  Real wallet funded. Continue to the live trade desk for real execution.
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <Link href="/wallet/deposit">
                  <Button>Deposit Funds</Button>
                </Link>
                <Button onClick={() => router.push("/trade")} variant="outline" disabled={!realHasFunds}>
                  Open Real Trade Desk
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      ) : paperAccount ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <SummaryCard title="Cash Balance" value={paperAccount.account.balance} accent="text-white" />
            <SummaryCard title="Used Margin" value={paperAccount.account.usedMargin} accent="text-slate-100" />
            <SummaryCard title="Equity" value={paperAccount.account.equity} accent="text-emerald-300" />
            <SummaryCard
              title="Realized PnL"
              value={formatSigned(paperAccount.account.realizedPnl)}
              accent={pnlTone(paperAccount.account.realizedPnl)}
            />
            <SummaryCard
              title="Unrealized PnL"
              value={formatSigned(paperAccount.account.unrealizedPnl)}
              accent={pnlTone(paperAccount.account.unrealizedPnl)}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_380px]">
            <Card>
              <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4">
                <div>
                  <CardTitle className="text-xl">{selectedSymbol.replace("USDT", "/USDT")}</CardTitle>
                  <CardDescription>{summarizeMarket(marketPair, markReferencePrice)}</CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  {MARKET_TIMEFRAMES.map((timeframe) => (
                    <button
                      key={timeframe}
                      onClick={() => setSelectedInterval(timeframe)}
                      className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                        selectedInterval === timeframe
                          ? "bg-emerald-600 text-white"
                          : "border border-zinc-700 bg-zinc-950 text-slate-300 hover:bg-zinc-900"
                      }`}
                    >
                      {timeframe}
                    </button>
                  ))}
                </div>
              </CardHeader>
              <CardContent>
                <MarketChartShell
                  candles={candles}
                  symbol={selectedSymbol}
                  interval={selectedInterval}
                  currentPrice={markReferencePrice || marketPair?.lastPrice || null}
                  streamState={isSocketConnected ? "LIVE" : restFallback ? "RECONNECTING" : "DELAYED"}
                />
              </CardContent>
            </Card>

            <div className="space-y-4">
              <div
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${
                  isDepthSocketConnected
                    ? "border-emerald-700/40 bg-emerald-500/10 text-emerald-200"
                    : "border-amber-700/40 bg-amber-500/10 text-amber-200"
                }`}
              >
                {isDepthSocketConnected ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
                {isDepthSocketConnected ? "Order Book Live" : "Order Book Reconnecting"}
                {depthFeedError ? (
                  <span className="text-[11px] text-amber-200/90">
                    • {depthFeedError}
                  </span>
                ) : null}
              </div>
              <OrderBook symbol={selectedSymbol} orderBook={orderBook} />
              <DepthChart symbol={selectedSymbol} orderBook={orderBook} />
              <RecentTradesFeed symbol={selectedSymbol} trades={recentTrades} />
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Order Ticket</CardTitle>
                <CardDescription>Market or limit demo execution with isolated leverage</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3">
                  <div className="inline-flex rounded-xl border border-zinc-700 bg-zinc-950/70 p-1">
                    <button
                      onClick={() => syncPositionType("LONG")}
                      className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                        positionType === "LONG" ? "bg-emerald-600 text-white" : "text-slate-300"
                      }`}
                    >
                      Long
                    </button>
                    <button
                      onClick={() => syncPositionType("SHORT")}
                      className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                        positionType === "SHORT" ? "bg-red-600 text-white" : "text-slate-300"
                      }`}
                    >
                      Short
                    </button>
                  </div>

                  <div className="inline-flex rounded-xl border border-zinc-700 bg-zinc-950/70 p-1">
                    <button
                      onClick={() => setSide("BUY")}
                      className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                        side === "BUY" ? "bg-emerald-600 text-white" : "text-slate-300"
                      }`}
                    >
                      Buy
                    </button>
                    <button
                      onClick={() => setSide("SELL")}
                      className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                        side === "SELL" ? "bg-red-600 text-white" : "text-slate-300"
                      }`}
                    >
                      Sell
                    </button>
                  </div>

                  <div className="inline-flex rounded-xl border border-zinc-700 bg-zinc-950/70 p-1">
                    <button
                      onClick={() => setOrderType("MARKET")}
                      className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                        orderType === "MARKET" ? "bg-emerald-600 text-white" : "text-slate-300"
                      }`}
                    >
                      Market
                    </button>
                    <button
                      onClick={() => setOrderType("LIMIT")}
                      className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                        orderType === "LIMIT" ? "bg-emerald-600 text-white" : "text-slate-300"
                      }`}
                    >
                      Limit
                    </button>
                  </div>
                </div>

                <label className="space-y-1.5">
                  <span className="text-xs uppercase tracking-wide text-slate-500">Search Pair</span>
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="BTC, ETH, SOL..."
                    className="h-10 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </label>

                <label className="space-y-1.5">
                  <span className="text-xs uppercase tracking-wide text-slate-500">Pair</span>
                  <select
                    value={selectedSymbol}
                    onChange={(event) => setSelectedSymbol(event.target.value)}
                    className="h-10 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    {pairOptions.map((pair) => (
                      <option key={pair.symbol} value={pair.symbol}>
                        {pair.displaySymbol}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="text-[11px] text-slate-500">
                  {isSelectionSynced ? "Selection synced to URL." : "Syncing selection..."}
                </p>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1.5">
                    <span className="text-xs uppercase tracking-wide text-slate-500">Quantity</span>
                    <input
                      value={quantity}
                      onChange={(event) => setQuantity(event.target.value.replace(/[^\d.]/g, ""))}
                      placeholder="0.0100"
                      className="h-10 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <div className="flex gap-2">
                      {[25, 50, 100].map((percent) => (
                        <button
                          key={percent}
                          type="button"
                          onClick={() => handleQuickQuantityFill(percent)}
                          className="rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-[11px] text-slate-300 transition hover:border-emerald-700/50 hover:text-emerald-200"
                        >
                          {percent}%
                        </button>
                      ))}
                    </div>
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-xs uppercase tracking-wide text-slate-500">Leverage</span>
                    <select
                      value={leverage}
                      onChange={(event) => setLeverage(event.target.value as (typeof LEVERAGE_OPTIONS)[number])}
                      className="h-10 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      {LEVERAGE_OPTIONS.map((value) => (
                        <option key={value} value={value}>
                          {value}x
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                {orderType === "LIMIT" ? (
                  <label className="space-y-1.5">
                    <span className="text-xs uppercase tracking-wide text-slate-500">Limit Price</span>
                    <input
                      value={limitPrice}
                      onChange={(event) => setLimitPrice(event.target.value.replace(/[^\d.]/g, ""))}
                      placeholder={marketPair?.lastPrice ?? "0.00"}
                      className="h-10 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </label>
                ) : null}

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1.5">
                    <span className="text-xs uppercase tracking-wide text-slate-500">Stop Loss</span>
                    <input
                      value={stopLossPrice}
                      onChange={(event) => setStopLossPrice(event.target.value.replace(/[^\d.]/g, ""))}
                      placeholder="Optional"
                      className="h-10 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-xs uppercase tracking-wide text-slate-500">Take Profit</span>
                    <input
                      value={takeProfitPrice}
                      onChange={(event) => setTakeProfitPrice(event.target.value.replace(/[^\d.]/g, ""))}
                      placeholder="Optional"
                      className="h-10 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </label>
                </div>

                <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4 text-sm">
                  <div className="flex items-center justify-between text-slate-300">
                    <span>{orderType === "LIMIT" ? "Reference price" : "Market price"}</span>
                    <span>{referencePrice ? `${formatCompact(referencePrice)} USDT` : "-"}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-slate-300">
                    <span>Estimated notional</span>
                    <span>{estimatedNotional} USDT</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-slate-300">
                    <span>Required margin</span>
                    <span>{estimatedMargin} USDT</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-slate-300">
                    <span>Estimated liquidation</span>
                    <span>{estimatedLiquidationPrice} USDT</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-slate-300">Risk to liquidation</span>
                    <span className={`font-medium ${riskToneClass}`}>
                      {riskDistancePercent === null ? "--" : `${riskDistancePercent.toFixed(2)}%`}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-slate-400">
                    <span>Max qty at {leverage}x</span>
                    <span>{maxQuantityForSelectedLeverage > 0 ? formatCompact(String(maxQuantityForSelectedLeverage)) : "-"}</span>
                  </div>
                </div>

                <Button className="w-full gap-2" disabled={isSubmitting} onClick={() => void handleSubmitOrder()}>
                  <RefreshCw className="h-4 w-4" />
                  {isSubmitting ? "Submitting..." : `Place ${side} ${orderType} Order`}
                </Button>

                <div className="rounded-2xl border border-emerald-800/30 bg-emerald-950/20 p-4 text-sm text-slate-300">
                  <div className="flex items-center gap-2 text-emerald-200">
                    <ShieldCheck className="h-4 w-4" />
                    Demo-only execution
                  </div>
                  <p className="mt-2 text-slate-400">
                    Orders are simulated against live prices for paper trading only. No wallet transfer, escrow move, or P2P settlement is executed.
                  </p>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Open Positions</CardTitle>
                  <CardDescription>Live mark-to-market view using the latest feed price</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {paperAccount.positions.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-zinc-700 px-4 py-6 text-sm text-slate-500">
                      No open demo positions yet. Use the ticket to open a long or short trade.
                    </div>
                  ) : (
                    paperAccount.positions.map((position) => {
                      const risk = getRiskDraft(position);
                      const positionRiskTone = getPositionRiskTone(position);
                      return (
                        <div key={position.id} className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-semibold text-white">{position.symbol.replace("USDT", "/USDT")}</p>
                              <span
                                className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                                  position.positionType === "LONG"
                                    ? "bg-emerald-500/10 text-emerald-300"
                                    : "bg-red-500/10 text-red-300"
                                }`}
                              >
                                {position.positionType}
                              </span>
                              <span className="rounded-full bg-zinc-900 px-2.5 py-1 text-[11px] text-slate-300">
                                {position.leverage}x
                              </span>
                            </div>
                            <Button variant="outline" size="sm" disabled={isSubmitting} onClick={() => void handleClosePosition(position.symbol)}>
                              Close
                            </Button>
                          </div>

                          <div className="grid gap-3 text-xs text-slate-500 sm:grid-cols-2 lg:grid-cols-4">
                            <p>Entry {formatCompact(position.averageEntryPrice)}</p>
                            <p>Mark {formatCompact(position.currentPrice)}</p>
                            <p>Size {position.quantity}</p>
                            <p>Liq {formatCompact(position.liquidationPrice)}</p>
                          </div>

                          <div className="grid gap-3 text-xs text-slate-500 sm:grid-cols-2 lg:grid-cols-3">
                            <p>Margin {formatCompact(position.margin)} USDT</p>
                            <p>Notional {formatCompact(position.currentNotional)} USDT</p>
                            <p className={pnlTone(position.unrealizedPnl)}>
                              Unrealized {formatSigned(position.unrealizedPnl)} ({formatSigned(position.unrealizedPnlPercent)}%)
                            </p>
                          </div>
                          <p className={`text-xs font-medium ${positionRiskTone.className}`}>
                            {positionRiskTone.label}
                          </p>

                          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                            <input
                              value={risk.stopLossPrice}
                              onChange={(event) => updateRiskDraft(position.id, "stopLossPrice", event.target.value.replace(/[^\d.]/g, ""))}
                              placeholder="Stop loss"
                              className="h-9 rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-xs text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500"
                            />
                            <input
                              value={risk.takeProfitPrice}
                              onChange={(event) => updateRiskDraft(position.id, "takeProfitPrice", event.target.value.replace(/[^\d.]/g, ""))}
                              placeholder="Take profit"
                              className="h-9 rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-xs text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500"
                            />
                            <Button size="sm" variant="outline" disabled={isSubmitting} onClick={() => void handleUpdateRisk(position.symbol, position.id)}>
                              Update SL/TP
                            </Button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Pending Orders</CardTitle>
                  <CardDescription>Open limit orders waiting for trigger</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {pendingOrders.length === 0 ? (
                    <p className="text-sm text-slate-500">No pending limit orders.</p>
                  ) : (
                    pendingOrders.map((order) => (
                      <div key={order.id} className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-medium text-slate-100">{order.symbol.replace("USDT", "/USDT")}</p>
                            <span className="rounded-full bg-zinc-900 px-2 py-0.5 text-[11px] text-slate-300">{order.leverage}x</span>
                          </div>
                          <Button variant="outline" size="sm" disabled={isSubmitting} onClick={() => void handleCancelOrder(order.id)} className="gap-1">
                            <XCircle className="h-3.5 w-3.5" />
                            Cancel
                          </Button>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          {order.side} {order.type} | Limit {formatCompact(order.limitPrice)} | Qty {order.quantity}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">Reserved margin {formatCompact(order.reservedMargin)} USDT</p>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Order History</CardTitle>
                  <CardDescription>Filled and canceled demo orders</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {orderHistory.length === 0 ? (
                    <p className="text-sm text-slate-500">No order history yet.</p>
                  ) : (
                    orderHistory.map((order) => (
                      <div key={order.id} className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium text-slate-100">{order.symbol.replace("USDT", "/USDT")}</p>
                          <p className="text-xs text-slate-400">{order.type} | {order.status}</p>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          {order.side} | Qty {order.quantity} | Limit {formatCompact(order.limitPrice)} | Fill {formatCompact(order.executedPrice)}
                        </p>
                        <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                          <Clock3 className="h-3.5 w-3.5" />
                          {new Date(order.createdAt).toLocaleString()}
                        </p>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Trade History</CardTitle>
                  <CardDescription>Closed paper trades and realized PnL</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {paperAccount.tradeHistory.length === 0 ? (
                    <p className="text-sm text-slate-500">No closed demo trades yet.</p>
                  ) : (
                    paperAccount.tradeHistory.map((trade) => (
                      <div key={trade.id} className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-medium text-slate-100">{trade.symbol.replace("USDT", "/USDT")}</p>
                            <span className="rounded-full bg-zinc-900 px-2 py-0.5 text-[11px] text-slate-300">{trade.leverage}x</span>
                          </div>
                          <p className={`text-xs font-medium ${pnlTone(trade.realizedPnl)}`}>{formatSigned(trade.realizedPnl)}</p>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          Entry {formatCompact(trade.entryPrice)} | Exit {formatCompact(trade.exitPrice)} | Qty {trade.quantity}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">Close reason {reasonLabel(trade.closeReason)}</p>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>
          </div>

          <p className="flex items-center gap-2 text-xs text-slate-500">
            <Activity className="h-3.5 w-3.5" />
            <LineChart className="h-3.5 w-3.5" />
            {restFallback
              ? "Live stream reconnecting; temporary polling fallback active."
              : "Live market data powers demo pricing; margin, PnL, orders, and triggers remain simulation-only."}
          </p>
        </>
      ) : null}
    </section>
  );
}

export default function DemoTradingPage() {
  return (
    <Suspense fallback={<LoadingState label="Preparing demo trading workspace" />}>
      <DemoTradingPageContent />
    </Suspense>
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

