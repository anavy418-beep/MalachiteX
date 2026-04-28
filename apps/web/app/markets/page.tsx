"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CandlestickChart,
  Search,
  Signal,
  Wifi,
  WifiOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MarketChartShell } from "@/components/markets/market-chart-shell";
import { MarketSparkline, type SparklinePoint } from "@/components/markets/market-sparkline";
import { MARKET_CATEGORIES, type MarketCategory } from "@/lib/mock-market-data";
import {
  buildMarketSelectionPath,
  DEFAULT_SUPPORTED_MARKET_SYMBOLS,
  normalizeMarketSelection,
  normalizeMarketSymbol,
  shouldFallbackToDefaultMarketSymbol,
  withSelectedPair,
} from "@/lib/market-selection";
import { OrderBook } from "@/components/markets/order-book";
import { RecentTradesFeed } from "@/components/markets/recent-trades-feed";
import {
  MARKET_TIMEFRAMES,
  marketsService,
  toMarketDataErrorMessage,
  type MarketCandle,
  type MarketsSocketState,
  type MarketOrderBookSnapshot,
  type MarketRecentTrade,
  type MarketTickerSnapshot,
} from "@/services/markets.service";

const TRACKED_SYMBOLS = [...DEFAULT_SUPPORTED_MARKET_SYMBOLS];
type MarketSortOption = "market_cap" | "volume" | "gainers" | "losers" | "price_high" | "price_low";

const MARKET_SORT_OPTIONS: Array<{ value: MarketSortOption; label: string }> = [
  { value: "market_cap", label: "Market Cap" },
  { value: "volume", label: "24h Volume" },
  { value: "gainers", label: "Top Gainers" },
  { value: "losers", label: "Top Losers" },
  { value: "price_high", label: "Price (High)" },
  { value: "price_low", label: "Price (Low)" },
];
const FALLBACK_COIN_ICON = "/icons/coin-fallback.png";
const LIVE_MARKET_API_ENDPOINT = "/api/market/live";
const BINANCE_REST_BASE_URL = "https://api.binance.com";
const BINANCE_STREAM_BASE_URL = "wss://stream.binance.com:9443/ws";
const CHART_BOOTSTRAP_LIMIT = 100;
const CHART_RECONNECT_DELAY_MS = 2_000;
const MARKET_REFRESH_INTERVAL_MS = 45_000;
const MARKET_MIN_REFRESH_INTERVAL_MS = 30_000;
const MARKET_RETRY_BASE_MS = 30_000;
const MARKET_RETRY_MAX_MS = 180_000;
const MANUAL_RETRY_COOLDOWN_MS = 8_000;
const SPARKLINE_INTERVAL: (typeof MARKET_TIMEFRAMES)[number] = "15m";
const SPARKLINE_WINDOW_SIZE = 96;
const SPARKLINE_BOOTSTRAP_CONCURRENCY = 6;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

type CoinGeckoMarketItem = {
  id: string;
  symbol: string;
  name: string;
  icon: string;
  price: number;
  change24h: number;
  marketCap: number;
  volume24h: number;
  trend?: number[];
};

type LiveMarketApiResponse = {
  items: CoinGeckoMarketItem[];
  isLive: boolean;
  isStale: boolean;
  source: "coingecko" | "cache";
  lastUpdated: string;
  message?: string;
  nextRefreshInMs: number;
};

type LiveMarketCoin = {
  id: string;
  name: string;
  symbol: string;
  price: number;
  change24h: number;
  marketCap: number;
  volume24h: number;
  category: MarketCategory;
  icon: string;
  trend: number[];
};

type BinanceRestKline = [
  number,
  string,
  string,
  string,
  string,
  string,
  number,
  string,
  number,
  string,
  string,
  string?,
];

type BinanceWsKlinePayload = {
  k?: {
    t: number;
    T: number;
    s: string;
    i: string;
    o: string;
    h: string;
    l: string;
    c: string;
    v: string;
    q: string;
    n: number;
    x: boolean;
  };
};

type BinanceTicker24hResponse = {
  symbol: string;
  lastPrice: string;
  openPrice: string;
  highPrice: string;
  lowPrice: string;
  priceChangePercent: string;
  quoteVolume: string;
};

type BinanceWsTickerPayload = {
  s: string;
  c: string;
  o: string;
  h: string;
  l: string;
  P: string;
  q: string;
};

type LiveStatSnapshot = {
  lastPrice: string;
  openPrice: string;
  highPrice: string;
  lowPrice: string;
  priceChangePercent: string;
  quoteVolume: string;
};

type SparklineBySymbol = Record<string, SparklinePoint[]>;
type MarketFeedStatus = "LIVE_WEBSOCKET" | "LIVE_POLLING" | "REST_FALLBACK";

const STABLE_SYMBOLS = new Set(["USDT", "USDC", "DAI", "FDUSD", "USDE"]);
const MEME_SYMBOLS = new Set(["DOGE", "SHIB", "PEPE", "BONK", "WIF", "FLOKI"]);
const EXCHANGE_SYMBOLS = new Set(["BNB", "OKB", "LEO", "BGB", "CRO", "KCS"]);
const LAYER2_SYMBOLS = new Set(["ARB", "OP", "POL", "MATIC", "STRK", "IMX"]);
const DEFI_SYMBOLS = new Set(["UNI", "AAVE", "LINK", "MKR", "INJ", "SNX", "COMP"]);
const AI_WEB3_SYMBOLS = new Set(["RNDR", "RENDER", "NEAR", "ICP", "FET", "TAO", "GRT", "FIL"]);

function inferCategory(coin: CoinGeckoMarketItem): MarketCategory {
  const symbol = coin.symbol.toUpperCase();

  if (STABLE_SYMBOLS.has(symbol)) return "Stablecoin";
  if (MEME_SYMBOLS.has(symbol)) return "Meme";
  if (EXCHANGE_SYMBOLS.has(symbol)) return "Exchange";
  if (LAYER2_SYMBOLS.has(symbol)) return "Layer 2";
  if (DEFI_SYMBOLS.has(symbol)) return "DeFi";
  if (AI_WEB3_SYMBOLS.has(symbol)) return "AI / Web3";
  if (coin.marketCap >= 10_000_000_000) return "Large Cap";
  return "Layer 1";
}

function toUsdtPairSymbol(baseSymbol: string) {
  return normalizeMarketSymbol(`${baseSymbol}USDT`, "");
}

function parseFiniteNumber(value: string | number | null | undefined) {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function buildSparklinePointsFromCandles(candles: MarketCandle[]) {
  return candles
    .map((candle) => {
      const value = parseFiniteNumber(candle.close);
      if (value === null) return null;
      return {
        time: Number.isFinite(candle.closeTime) ? candle.closeTime : candle.openTime,
        value,
      } satisfies SparklinePoint;
    })
    .filter((point): point is SparklinePoint => Boolean(point))
    .sort((left, right) => left.time - right.time)
    .slice(-SPARKLINE_WINDOW_SIZE);
}

function buildSparklinePointsFromTrend(trend: number[]) {
  const values = trend
    .map((value) => parseFiniteNumber(value))
    .filter((value): value is number => value !== null && value > 0)
    .slice(-SPARKLINE_WINDOW_SIZE);

  if (values.length < 2) {
    return [];
  }

  const now = Date.now();
  const totalPoints = values.length;
  const stepMs = ONE_DAY_MS / Math.max(totalPoints - 1, 1);

  return values.map((value, index) => ({
    time: Math.floor(now - (totalPoints - 1 - index) * stepMs),
    value,
  })) satisfies SparklinePoint[];
}

function seedSparklineFromTicker(ticker: MarketTickerSnapshot) {
  const open = parseFiniteNumber(ticker.openPrice);
  const last = parseFiniteNumber(ticker.lastPrice);
  if (open === null || last === null) return [];

  const endTime = Number.isFinite(ticker.closeTime) ? ticker.closeTime : Date.now();
  const startTime = Number.isFinite(ticker.openTime) ? ticker.openTime : endTime - ONE_DAY_MS;

  return [
    { time: startTime, value: open },
    { time: endTime, value: last },
  ] satisfies SparklinePoint[];
}

function appendSparklinePoint(current: SparklinePoint[], incoming: SparklinePoint) {
  if (current.length === 0) {
    return [incoming];
  }

  const last = current[current.length - 1];
  if (incoming.time === last.time) {
    if (incoming.value === last.value) {
      return current;
    }
    return [...current.slice(0, -1), incoming];
  }

  if (incoming.time < last.time) {
    return current;
  }

  return [...current, incoming].slice(-SPARKLINE_WINDOW_SIZE);
}

function toLiveMarketCoin(coin: CoinGeckoMarketItem): LiveMarketCoin {
  const trendSource = Array.isArray(coin.trend) ? coin.trend : [];
  const trend = trendSource
    .slice(-24)
    .map((value) => (Number.isFinite(value) ? value : coin.price))
    .filter((value) => Number.isFinite(value));
  const baseline = Number.isFinite(coin.price) && Number.isFinite(coin.change24h)
    ? coin.price / (1 + coin.change24h / 100)
    : coin.price;
  const safeTrend = trend.length >= 2 ? trend : [baseline, coin.price];

  return {
    id: coin.id,
    name: coin.name,
    symbol: coin.symbol.toUpperCase(),
    price: Number.isFinite(coin.price) ? coin.price : 0,
    change24h: Number.isFinite(coin.change24h) ? coin.change24h : 0,
    marketCap: Number.isFinite(coin.marketCap) ? coin.marketCap : 0,
    volume24h: Number.isFinite(coin.volume24h) ? coin.volume24h : 0,
    category: inferCategory(coin),
    icon: typeof coin.icon === "string" && coin.icon.length > 0 ? coin.icon : FALLBACK_COIN_ICON,
    trend: safeTrend,
  };
}

function mapBinanceRestKlineToMarketCandle(
  symbol: string,
  interval: string,
  entry: BinanceRestKline,
): MarketCandle {
  return {
    symbol,
    interval,
    openTime: entry[0],
    closeTime: entry[6],
    open: entry[1],
    high: entry[2],
    low: entry[3],
    close: entry[4],
    volume: entry[5],
    quoteVolume: entry[7],
    tradeCount: entry[8],
    isClosed: true,
    updatedAt: Date.now(),
  };
}

function mapBinanceWsKlineToMarketCandle(kline: NonNullable<BinanceWsKlinePayload["k"]>): MarketCandle {
  return {
    symbol: kline.s,
    interval: kline.i,
    openTime: kline.t,
    closeTime: kline.T,
    open: kline.o,
    high: kline.h,
    low: kline.l,
    close: kline.c,
    volume: kline.v,
    quoteVolume: kline.q,
    tradeCount: kline.n,
    isClosed: kline.x,
    updatedAt: Date.now(),
  };
}

function mergeIncomingCandle(current: MarketCandle[], incoming: MarketCandle) {
  if (current.length === 0) {
    return [incoming];
  }

  const last = current[current.length - 1];
  if (last.openTime === incoming.openTime) {
    return [...current.slice(0, -1), incoming];
  }

  if (incoming.openTime > last.openTime) {
    return [...current, incoming].slice(-CHART_BOOTSTRAP_LIMIT);
  }

  const next = [...current];
  const index = next.findIndex((entry) => entry.openTime === incoming.openTime);
  if (index >= 0) {
    next[index] = incoming;
    return next;
  }

  return [...next, incoming].sort((left, right) => left.openTime - right.openTime).slice(-CHART_BOOTSTRAP_LIMIT);
}

function mapBinanceTickerToLiveStats(payload: BinanceTicker24hResponse | BinanceWsTickerPayload): LiveStatSnapshot {
  if ("lastPrice" in payload) {
    return {
      lastPrice: payload.lastPrice,
      openPrice: payload.openPrice,
      highPrice: payload.highPrice,
      lowPrice: payload.lowPrice,
      priceChangePercent: payload.priceChangePercent,
      quoteVolume: payload.quoteVolume,
    };
  }

  return {
    lastPrice: payload.c,
    openPrice: payload.o,
    highPrice: payload.h,
    lowPrice: payload.l,
    priceChangePercent: payload.P,
    quoteVolume: payload.q,
  };
}

function formatPrice(price: string) {
  const value = Number.parseFloat(price);
  if (!Number.isFinite(value)) return "-";

  if (value >= 1000) {
    return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  if (value >= 1) {
    return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  }
  return value.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 8 });
}

function formatVolume(volume: string) {
  const value = Number.parseFloat(volume);
  if (!Number.isFinite(value)) return "-";
  return value.toLocaleString(undefined, {
    notation: "compact",
    maximumFractionDigits: 2,
  });
}

function formatPercent(value: string) {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return "0.00%";
  return `${parsed >= 0 ? "+" : ""}${parsed.toFixed(2)}%`;
}

function toneForChange(change: string) {
  return Number.parseFloat(change) >= 0 ? "text-emerald-300" : "text-red-300";
}

function formatUsd(value: number) {
  if (value >= 1000) {
    return `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  }
  if (value >= 1) {
    return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
  }
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 8 })}`;
}

function formatCompact(value: number) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);
}

function toDisplayPairLabel(symbol: string | null | undefined) {
  if (!symbol) return "BTC/USDT";

  const normalized = symbol.toUpperCase();
  const quoteAssets = ["USDT", "USDC", "BUSD", "BTC", "ETH"];

  for (const quote of quoteAssets) {
    if (normalized.endsWith(quote) && normalized.length > quote.length) {
      return `${normalized.slice(0, -quote.length)}/${quote}`;
    }
  }

  return normalized;
}

function MarketsPageContent() {
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
  const [selectedSymbol, setSelectedSymbol] = useState(() =>
    initialSelection.symbol,
  );
  const [selectedInterval, setSelectedInterval] = useState<(typeof MARKET_TIMEFRAMES)[number]>(() =>
    initialSelection.interval,
  );
  const [overviewPairs, setOverviewPairs] = useState<MarketTickerSnapshot[]>([]);
  const [searchResults, setSearchResults] = useState<MarketTickerSnapshot[]>([]);
  const [candles, setCandles] = useState<MarketCandle[]>([]);
  const [orderBook, setOrderBook] = useState<MarketOrderBookSnapshot | null>(null);
  const [recentTrades, setRecentTrades] = useState<MarketRecentTrade[]>([]);
  const [topGainers, setTopGainers] = useState<MarketTickerSnapshot[]>([]);
  const [topLosers, setTopLosers] = useState<MarketTickerSnapshot[]>([]);
  const [search, setSearch] = useState("");
  const [marketSearch, setMarketSearch] = useState("");
  const [marketCategory, setMarketCategory] = useState<(typeof MARKET_CATEGORIES)[number]>("All");
  const [marketSort, setMarketSort] = useState<MarketSortOption>("market_cap");
  const [marketData, setMarketData] = useState<LiveMarketCoin[]>([]);
  const [sparklineBySymbol, setSparklineBySymbol] = useState<SparklineBySymbol>({});
  const [marketLoading, setMarketLoading] = useState(true);
  const [marketError, setMarketError] = useState<string | null>(null);
  const [marketRefreshNonce, setMarketRefreshNonce] = useState(0);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [marketFeedMode, setMarketFeedMode] = useState<"LIVE" | "CACHED" | "OFFLINE">("OFFLINE");
  const [isRetryCoolingDown, setIsRetryCoolingDown] = useState(false);
  const [isSocketConnected, setIsSocketConnected] = useState(false);
  const [socketLifecycleState, setSocketLifecycleState] = useState<MarketsSocketState>("connecting");
  const [restFallback, setRestFallback] = useState(false);
  const [chartStreamState, setChartStreamState] = useState<"LIVE" | "RECONNECTING" | "DELAYED">("DELAYED");
  const [liveChartPrice, setLiveChartPrice] = useState<string | null>(null);
  const [liveStats, setLiveStats] = useState<LiveStatSnapshot | null>(null);
  const [lastSocketDataAt, setLastSocketDataAt] = useState<number | null>(null);
  const [lastSocketFailureAt, setLastSocketFailureAt] = useState<number | null>(null);
  const [lastPollingSuccessAt, setLastPollingSuccessAt] = useState<number | null>(null);
  const [chartBootstrapError, setChartBootstrapError] = useState<string | null>(null);
  const [chartRefreshNonce, setChartRefreshNonce] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const deferredSearch = useDeferredValue(search);
  const hasMarketSnapshotRef = useRef(false);
  const retryCooldownTimerRef = useRef<number | null>(null);
  const sparklineBootstrappedSymbolsRef = useRef(new Set<string>());

  const selectedPair = useMemo(
    () => [...overviewPairs, ...searchResults].find((pair) => pair.symbol === selectedSymbol) ?? null,
    [overviewPairs, searchResults, selectedSymbol],
  );
  const activePairLabel = useMemo(
    () => selectedPair?.displaySymbol ?? toDisplayPairLabel(selectedSymbol),
    [selectedPair?.displaySymbol, selectedSymbol],
  );
  const selectablePairs = useMemo(() => {
    const map = new Map<string, MarketTickerSnapshot>();
    [...searchResults, ...overviewPairs].forEach((pair) => {
      map.set(pair.symbol, pair);
    });
    return withSelectedPair([...map.values()], selectedSymbol);
  }, [overviewPairs, searchResults, selectedSymbol]);
  const normalizedSupportedSymbols = useMemo(() => {
    const symbols = new Set<string>(TRACKED_SYMBOLS);
    selectablePairs.forEach((pair) => symbols.add(pair.symbol));
    symbols.add(selectedSymbol);
    if (querySymbolCandidate) {
      symbols.add(querySymbolCandidate);
    }
    return [...symbols];
  }, [querySymbolCandidate, selectablePairs, selectedSymbol]);
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
  const fullMarketRows = useMemo(() => {
    const query = marketSearch.trim().toLowerCase();
    const filtered = marketData.filter((coin) => {
      if (marketCategory !== "All" && coin.category !== marketCategory) return false;
      if (!query) return true;
      return coin.name.toLowerCase().includes(query) || coin.symbol.toLowerCase().includes(query);
    });

    const sorted = [...filtered].sort((left, right) => {
      if (marketSort === "market_cap") return right.marketCap - left.marketCap;
      if (marketSort === "volume") return right.volume24h - left.volume24h;
      if (marketSort === "gainers") return right.change24h - left.change24h;
      if (marketSort === "losers") return left.change24h - right.change24h;
      if (marketSort === "price_high") return right.price - left.price;
      return left.price - right.price;
    });

    return sorted;
  }, [marketCategory, marketData, marketSearch, marketSort]);
  const marketPairSymbols = useMemo(() => {
    const symbols = new Set<string>();
    marketData.forEach((coin) => {
      const pairSymbol = toUsdtPairSymbol(coin.symbol);
      if (pairSymbol) {
        symbols.add(pairSymbol);
      }
    });
    return [...symbols];
  }, [marketData]);
  const socketWatchSymbols = useMemo(
    () => [...new Set([...TRACKED_SYMBOLS, selectedSymbol, ...marketPairSymbols])],
    [marketPairSymbols, selectedSymbol],
  );
  const socketWatchSymbolsKey = useMemo(
    () => [...new Set(socketWatchSymbols.map((symbol) => normalizeMarketSymbol(symbol, selectedSymbol)))]
      .filter(Boolean)
      .sort()
      .join(","),
    [selectedSymbol, socketWatchSymbols],
  );
  const hasFreshSocketData = useMemo(() => {
    if (!lastSocketDataAt) return false;
    return Date.now() - lastSocketDataAt <= 35_000;
  }, [lastSocketDataAt]);
  const marketFeedStatus = useMemo<MarketFeedStatus>(() => {
    if (isSocketConnected && hasFreshSocketData) {
      return "LIVE_WEBSOCKET";
    }
    if (restFallback && lastPollingSuccessAt) {
      return "LIVE_POLLING";
    }
    if (socketLifecycleState === "reconnecting" || socketLifecycleState === "offline" || lastSocketFailureAt) {
      return "REST_FALLBACK";
    }
    if (lastPollingSuccessAt) {
      return "LIVE_POLLING";
    }
    return "LIVE_POLLING";
  }, [hasFreshSocketData, isSocketConnected, lastPollingSuccessAt, lastSocketFailureAt, restFallback, socketLifecycleState]);
  const marketFeedBadgeClass = useMemo(() => {
    if (marketFeedStatus === "LIVE_WEBSOCKET") {
      return "border-emerald-700/40 bg-emerald-500/10 text-emerald-200";
    }
    if (marketFeedStatus === "LIVE_POLLING") {
      return "border-sky-700/50 bg-sky-500/10 text-sky-200";
    }
    return "border-amber-700/40 bg-amber-500/10 text-amber-200";
  }, [marketFeedStatus]);
  const marketFeedLabel = marketFeedStatus === "LIVE_WEBSOCKET"
    ? "LIVE WebSocket"
    : marketFeedStatus === "LIVE_POLLING"
      ? "LIVE via polling"
      : "REST fallback";
  const openDemoTrading = useCallback(
    (pairSymbol: string) => {
      if (!pairSymbol) return;
      router.push(`/demo-trading?symbol=${encodeURIComponent(pairSymbol)}`);
    },
    [router],
  );
  const applyTickersToMarketRows = useCallback((tickers: MarketTickerSnapshot[]) => {
    if (tickers.length === 0) return;
    const tickerBySymbol = new Map(tickers.map((ticker) => [ticker.symbol, ticker]));

    setMarketData((current) => {
      let changed = false;
      const next = current.map((coin) => {
        const pairSymbol = toUsdtPairSymbol(coin.symbol);
        if (!pairSymbol) return coin;
        const ticker = tickerBySymbol.get(pairSymbol);
        if (!ticker) return coin;

        const nextPrice = parseFiniteNumber(ticker.lastPrice);
        const nextChange24h = parseFiniteNumber(ticker.priceChangePercent);
        const nextVolume24h = parseFiniteNumber(ticker.quoteVolume);

        const updated: LiveMarketCoin = {
          ...coin,
          price: nextPrice ?? coin.price,
          change24h: nextChange24h ?? coin.change24h,
          volume24h: nextVolume24h ?? coin.volume24h,
        };

        if (
          updated.price === coin.price &&
          updated.change24h === coin.change24h &&
          updated.volume24h === coin.volume24h
        ) {
          return coin;
        }

        changed = true;
        return updated;
      });

      return changed ? next : current;
    });
  }, []);
  const applyTickersToSparklines = useCallback((tickers: MarketTickerSnapshot[]) => {
    if (tickers.length === 0) return;

    setSparklineBySymbol((current) => {
      let changed = false;
      const next: SparklineBySymbol = { ...current };

      tickers.forEach((ticker) => {
        const nextValue = parseFiniteNumber(ticker.lastPrice);
        if (nextValue === null) return;

        const point: SparklinePoint = {
          time: Number.isFinite(ticker.updatedAt) ? ticker.updatedAt : Date.now(),
          value: nextValue,
        };
        const seeded = next[ticker.symbol] ?? seedSparklineFromTicker(ticker);
        const merged = appendSparklinePoint(seeded, point);
        if (merged !== next[ticker.symbol]) {
          next[ticker.symbol] = merged;
          changed = true;
        }
      });

      return changed ? next : current;
    });
  }, []);
  const markSocketDataAsLive = useCallback(() => {
    setLastSocketDataAt(Date.now());
    setRestFallback(false);
  }, []);

  useEffect(() => {
    hasMarketSnapshotRef.current = marketData.length > 0;
  }, [marketData.length]);

  useEffect(() => {
    return () => {
      if (retryCooldownTimerRef.current !== null) {
        window.clearTimeout(retryCooldownTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const allowed = new Set(marketPairSymbols);
    sparklineBootstrappedSymbolsRef.current.forEach((symbol) => {
      if (!allowed.has(symbol)) {
        sparklineBootstrappedSymbolsRef.current.delete(symbol);
      }
    });

    setSparklineBySymbol((current) => {
      let changed = false;
      const next: SparklineBySymbol = {};
      Object.entries(current).forEach(([symbol, points]) => {
        if (!allowed.has(symbol)) {
          changed = true;
          return;
        }
        next[symbol] = points;
      });
      return changed ? next : current;
    });
  }, [marketPairSymbols]);

  useEffect(() => {
    let cancelled = false;

    const pending = marketPairSymbols.filter((symbol) => !sparklineBootstrappedSymbolsRef.current.has(symbol));
    if (pending.length === 0) {
      return;
    }
    pending.forEach((symbol) => sparklineBootstrappedSymbolsRef.current.add(symbol));

    const queue = [...pending];
    const bootstrapFromCandles = async () => {
      const collected: SparklineBySymbol = {};

      async function worker() {
        while (queue.length > 0 && !cancelled) {
          const symbol = queue.shift();
          if (!symbol) return;

          try {
            const response = await marketsService.getCandles(
              symbol,
              SPARKLINE_INTERVAL,
              SPARKLINE_WINDOW_SIZE,
            );
            const points = buildSparklinePointsFromCandles(response.candles);
            if (points.length >= 2) {
              collected[symbol] = points;
            }
          } catch {
            // Keep non-blocking sparkline bootstrap. Live tick stream will still populate.
          }
        }
      }

      const workerCount = Math.min(SPARKLINE_BOOTSTRAP_CONCURRENCY, queue.length);
      await Promise.all(Array.from({ length: workerCount }, () => worker()));

      if (cancelled || Object.keys(collected).length === 0) {
        return;
      }

      setSparklineBySymbol((current) => {
        let changed = false;
        const next = { ...current };

        Object.entries(collected).forEach(([symbol, points]) => {
          const existing = next[symbol];
          const isSameSeries =
            existing?.length === points.length &&
            existing.every((point, index) => point.time === points[index]?.time && point.value === points[index]?.value);
          if (isSameSeries) return;
          next[symbol] = points;
          changed = true;
        });

        return changed ? next : current;
      });
    };

    void bootstrapFromCandles();

    return () => {
      cancelled = true;
    };
  }, [marketPairSymbols]);

  useEffect(() => {
    let active = true;
    let timerId: number | null = null;
    let consecutiveFailures = 0;

    const scheduleNextFetch = (delayMs: number) => {
      if (!active) return;
      if (timerId !== null) {
        window.clearTimeout(timerId);
      }
      timerId = window.setTimeout(() => {
        void fetchMarketRows();
      }, delayMs);
    };

    async function fetchMarketRows() {
      let nextDelay = MARKET_REFRESH_INTERVAL_MS;
      try {
        if (!hasMarketSnapshotRef.current) {
          setMarketLoading(true);
        }

        const response = await fetch(LIVE_MARKET_API_ENDPOINT, {
          cache: "no-store",
        });

        const payload = (await response.json().catch(() => null)) as
          | (Partial<LiveMarketApiResponse> & { error?: string })
          | null;

        if (!response.ok) {
          throw new Error(payload?.error ?? `Live market request failed (${response.status})`);
        }

        if (!payload || !Array.isArray(payload.items)) {
          throw new Error("Live market response is invalid.");
        }

        if (!active) return;

        const mappedRows = payload.items
          .map(toLiveMarketCoin)
          .filter((coin) => Number.isFinite(coin.price) && coin.price > 0);

        if (mappedRows.length === 0) {
          throw new Error("Live market feed returned no rows.");
        }

        setMarketData(mappedRows);
        setSparklineBySymbol((current) => {
          let changed = false;
          const next = { ...current };

          mappedRows.forEach((coin) => {
            const pairSymbol = toUsdtPairSymbol(coin.symbol);
            if (!pairSymbol || (next[pairSymbol] && next[pairSymbol].length >= 2)) {
              return;
            }

            const seededPoints = buildSparklinePointsFromTrend(coin.trend);
            if (seededPoints.length < 2) {
              return;
            }

            next[pairSymbol] = seededPoints;
            changed = true;
          });

          return changed ? next : current;
        });
        setMarketFeedMode(payload.isStale ? "CACHED" : "LIVE");

        const lastUpdatedAt = payload.lastUpdated ? new Date(payload.lastUpdated) : new Date();
        setLastUpdated(Number.isNaN(lastUpdatedAt.getTime()) ? new Date() : lastUpdatedAt);

        const bannerMessage =
          payload.message ??
          (payload.isStale
            ? "Using recent cached market data. Live refresh will resume automatically."
            : null);
        setMarketError(bannerMessage);

        consecutiveFailures = payload.isStale ? Math.max(consecutiveFailures, 1) : 0;
        const requestedRefreshMs =
          typeof payload.nextRefreshInMs === "number" && Number.isFinite(payload.nextRefreshInMs)
            ? payload.nextRefreshInMs
            : MARKET_REFRESH_INTERVAL_MS;

        nextDelay = Math.min(
          MARKET_RETRY_MAX_MS,
          Math.max(
            MARKET_MIN_REFRESH_INTERVAL_MS,
            requestedRefreshMs,
          ),
        );
      } catch (fetchError) {
        if (!active) return;
        console.error("Live market fetch error:", fetchError);
        const hasSnapshot = hasMarketSnapshotRef.current;

        if (hasSnapshot) {
          setMarketFeedMode("CACHED");
          setMarketError("Using recent cached market data. Live refresh will resume automatically.");
        } else {
          setMarketFeedMode("OFFLINE");
          setMarketError("Live market temporarily unavailable. Retrying automatically.");
        }

        consecutiveFailures += 1;
        const multiplier = 2 ** Math.min(consecutiveFailures - 1, 4);
        nextDelay = Math.min(MARKET_RETRY_MAX_MS, MARKET_RETRY_BASE_MS * multiplier);
      } finally {
        if (active) {
          setMarketLoading(false);
          scheduleNextFetch(nextDelay);
        }
      }
    }

    void fetchMarketRows();

    return () => {
      active = false;
      if (timerId !== null) {
        window.clearTimeout(timerId);
      }
    };
  }, [marketRefreshNonce]);

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
    let cancelled = false;

    async function bootstrap() {
      setLoading(true);
      setError(null);

      try {
        const [overview, pairSearch, orderBookResponse, recentTradesResponse] = await Promise.all([
          marketsService.getOverview(TRACKED_SYMBOLS),
          marketsService.searchPairs("", 16),
          marketsService.getOrderBook(selectedSymbol, 20),
          marketsService.getRecentTrades(selectedSymbol, 50),
        ]);

        if (cancelled) return;

        setOverviewPairs(overview.pairs);
        setTopGainers(overview.topGainers);
        setTopLosers(overview.topLosers);
        setSearchResults(pairSearch.pairs);
        setOrderBook(orderBookResponse.orderBook);
        setRecentTrades(recentTradesResponse.trades);
        setLastPollingSuccessAt(Date.now());
      } catch (err) {
        if (cancelled) return;
        const message = toMarketDataErrorMessage(err, "Unable to load market data.");
        if (shouldFallbackToDefaultMarketSymbol(message)) {
          setSelectedSymbol((current) => (current === TRACKED_SYMBOLS[0] ? current : TRACKED_SYMBOLS[0]));
        }
        setError(message);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [selectedSymbol]);

  useEffect(() => {
    const symbolsToWatch = socketWatchSymbolsKey
      .split(",")
      .map((symbol) => symbol.trim())
      .filter(Boolean);
    const connection = marketsService.connectSocket({
      onConnect(connected) {
        setIsSocketConnected(connected);
        if (connected) {
          setSocketLifecycleState("live");
          setLastSocketFailureAt(null);
        }
      },
      onConnectionStateChange(state) {
        setSocketLifecycleState(state);
        if (state !== "live") {
          setIsSocketConnected(false);
        }
        if (state === "reconnecting" || state === "offline") {
          setLastSocketFailureAt(Date.now());
        }
      },
      onBootstrap(tickers) {
        if (tickers.length === 0) return;
        markSocketDataAsLive();
        setOverviewPairs((current) => mergeTickers(current, tickers, TRACKED_SYMBOLS));
        applyTickersToMarketRows(tickers);
        applyTickersToSparklines(tickers);
      },
      onTicker(ticker) {
        markSocketDataAsLive();
        setOverviewPairs((current) => mergeTickers(current, [ticker], TRACKED_SYMBOLS));
        setSearchResults((current) => mergeTickers(current, [ticker]));
        setTopGainers((current) => replaceTicker(current, ticker));
        setTopLosers((current) => replaceTicker(current, ticker));
        applyTickersToMarketRows([ticker]);
        applyTickersToSparklines([ticker]);
      },
      onOrderBookBootstrap(payload) {
        if (payload.symbol === selectedSymbol) {
          markSocketDataAsLive();
          setOrderBook(payload.orderBook);
        }
      },
      onOrderBook(nextOrderBook) {
        if (nextOrderBook.symbol === selectedSymbol) {
          markSocketDataAsLive();
          setOrderBook(nextOrderBook);
        }
      },
      onTradesBootstrap(payload) {
        if (payload.symbol === selectedSymbol) {
          markSocketDataAsLive();
          setRecentTrades(payload.trades);
        }
      },
      onTrade(trade) {
        if (trade.symbol !== selectedSymbol) return;
        markSocketDataAsLive();
        setRecentTrades((current) => [trade, ...current.filter((entry) => entry.tradeId !== trade.tradeId)].slice(0, 60));
      },
    });

    connection.watchSymbols(symbolsToWatch);
    connection.watchOrderBook(selectedSymbol);
    connection.watchRecentTrades(selectedSymbol, 60);

    return () => {
      connection.unwatchSymbols(symbolsToWatch);
      connection.unwatchOrderBook(selectedSymbol);
      connection.unwatchRecentTrades(selectedSymbol);
      connection.disconnect();
    };
  }, [
    applyTickersToMarketRows,
    applyTickersToSparklines,
    markSocketDataAsLive,
    selectedSymbol,
    socketWatchSymbolsKey,
  ]);

  useEffect(() => {
    let active = true;
    let reconnectTimerId: number | null = null;
    let ws: WebSocket | null = null;

    const normalizedSymbol = selectedSymbol.toUpperCase();
    const streamName = `${normalizedSymbol.toLowerCase()}@kline_${selectedInterval}`;

    setChartStreamState("DELAYED");
    setLiveChartPrice(null);
    setChartBootstrapError(null);

    const connectStream = () => {
      if (!active) return;

      ws = new WebSocket(`${BINANCE_STREAM_BASE_URL}/${streamName}`);

      ws.onopen = () => {
        if (!active) return;
        setChartStreamState("LIVE");
      };

      ws.onmessage = (event) => {
        if (!active) return;

        try {
          const payload = JSON.parse(event.data) as BinanceWsKlinePayload;
          if (!payload.k || payload.k.s !== normalizedSymbol) return;

          const nextCandle = mapBinanceWsKlineToMarketCandle(payload.k);
          setCandles((current) => mergeIncomingCandle(current, nextCandle));
          setLiveChartPrice(nextCandle.close);
          setChartStreamState("LIVE");
        } catch {
          // Ignore malformed frames and keep stream alive.
        }
      };

      ws.onerror = () => {
        if (!active) return;
        setChartStreamState("RECONNECTING");
      };

      ws.onclose = () => {
        if (!active) return;
        setChartStreamState("RECONNECTING");
        reconnectTimerId = window.setTimeout(() => {
          connectStream();
        }, CHART_RECONNECT_DELAY_MS);
      };
    };

    async function bootstrapCandles() {
      try {
        const response = await fetch(
          `${BINANCE_REST_BASE_URL}/api/v3/klines?symbol=${normalizedSymbol}&interval=${selectedInterval}&limit=${CHART_BOOTSTRAP_LIMIT}`,
          { cache: "no-store" },
        );
        if (!response.ok) {
          throw new Error(`Failed to bootstrap candles (${response.status})`);
        }

        const payload = (await response.json()) as BinanceRestKline[];
        if (!active) return;

        const mapped = payload.map((entry) =>
          mapBinanceRestKlineToMarketCandle(normalizedSymbol, selectedInterval, entry),
        );
        setCandles(mapped);

        const last = mapped[mapped.length - 1];
        if (last) {
          setLiveChartPrice(last.close);
        }
      } catch (bootstrapError) {
        if (!active) return;
        const message =
          bootstrapError instanceof Error ? bootstrapError.message : "Unable to load chart candles.";
        setChartBootstrapError(message);
      } finally {
        connectStream();
      }
    }

    void bootstrapCandles();

    return () => {
      active = false;
      if (reconnectTimerId !== null) {
        window.clearTimeout(reconnectTimerId);
      }
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        ws.close();
      }
    };
  }, [selectedInterval, selectedSymbol, chartRefreshNonce]);

  useEffect(() => {
    let active = true;
    let reconnectTimerId: number | null = null;
    let ws: WebSocket | null = null;

    const normalizedSymbol = selectedSymbol.toUpperCase();
    const tickerStreamName = `${normalizedSymbol.toLowerCase()}@ticker`;

    const connectTickerStream = () => {
      if (!active) return;

      ws = new WebSocket(`${BINANCE_STREAM_BASE_URL}/${tickerStreamName}`);
      ws.onmessage = (event) => {
        if (!active) return;
        try {
          const payload = JSON.parse(event.data) as BinanceWsTickerPayload;
          if (!payload?.s || payload.s !== normalizedSymbol) return;
          setLiveStats(mapBinanceTickerToLiveStats(payload));
        } catch {
          // Ignore malformed frames and wait for next frame.
        }
      };
      ws.onclose = () => {
        if (!active) return;
        reconnectTimerId = window.setTimeout(() => {
          connectTickerStream();
        }, CHART_RECONNECT_DELAY_MS);
      };
    };

    async function bootstrapLiveStats() {
      try {
        const response = await fetch(
          `${BINANCE_REST_BASE_URL}/api/v3/ticker/24hr?symbol=${normalizedSymbol}`,
          { cache: "no-store" },
        );
        if (!response.ok) {
          throw new Error(`Failed to load ticker snapshot (${response.status})`);
        }
        const payload = (await response.json()) as BinanceTicker24hResponse;
        if (!active) return;
        setLiveStats(mapBinanceTickerToLiveStats(payload));
      } catch {
        if (!active) return;
        setLiveStats(null);
      } finally {
        connectTickerStream();
      }
    }

    void bootstrapLiveStats();

    return () => {
      active = false;
      if (reconnectTimerId !== null) {
        window.clearTimeout(reconnectTimerId);
      }
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        ws.close();
      }
    };
  }, [selectedSymbol]);

  useEffect(() => {
    let cancelled = false;
    async function runSearch() {
      try {
        const response = await marketsService.searchPairs(deferredSearch, 18);
        if (!cancelled) setSearchResults(response.pairs);
      } catch {
        if (!cancelled) setSearchResults([]);
      }
    }

    void runSearch();
    return () => {
      cancelled = true;
    };
  }, [deferredSearch]);

  useEffect(() => {
    if (marketFeedStatus === "LIVE_WEBSOCKET") return;

    const interval = window.setInterval(() => {
      void (async () => {
        try {
          const [overview, orderBookResponse, recentTradesResponse] = await Promise.all([
            marketsService.getOverview(TRACKED_SYMBOLS),
            marketsService.getOrderBook(selectedSymbol, 20),
            marketsService.getRecentTrades(selectedSymbol, 60),
          ]);

          setOverviewPairs(overview.pairs);
          setTopGainers(overview.topGainers);
          setTopLosers(overview.topLosers);
          setOrderBook(orderBookResponse.orderBook);
          setRecentTrades(recentTradesResponse.trades);
          setRestFallback(true);
          setLastPollingSuccessAt(Date.now());
        } catch {
          setRestFallback(true);
        }
      })();
    }, 12_000);

    return () => window.clearInterval(interval);
  }, [marketFeedStatus, selectedInterval, selectedSymbol]);

  const displayedLastPrice = liveChartPrice ?? liveStats?.lastPrice ?? selectedPair?.lastPrice ?? null;
  const displayedChangePercent = liveStats?.priceChangePercent ?? selectedPair?.priceChangePercent ?? null;
  const displayedHighPrice = liveStats?.highPrice ?? selectedPair?.highPrice ?? null;
  const displayedLowPrice = liveStats?.lowPrice ?? selectedPair?.lowPrice ?? null;
  const displayedVolume = liveStats?.quoteVolume ?? selectedPair?.quoteVolume ?? null;

  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.2em] text-emerald-300">Xorviqa Markets</p>
        <h1 className="text-3xl font-semibold text-white">Real-Time Markets</h1>
        <p className="text-sm text-slate-400">
          Live crypto prices, exchange-style charting, and a paper-trading feed layer designed to sit beside the current wallet and P2P flows.
        </p>
      </header>

      <Card className="border-emerald-900/50 bg-gradient-to-br from-emerald-950/40 via-zinc-950 to-zinc-900">
        <CardContent className="space-y-5 pt-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-700/40 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-200">
                  <Signal className="h-3.5 w-3.5" />
                  Binance spot market feed
                </span>
                <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs ${marketFeedBadgeClass}`}>
                  {marketFeedStatus === "LIVE_WEBSOCKET" || marketFeedStatus === "LIVE_POLLING"
                    ? <Wifi className="h-3.5 w-3.5" />
                    : <WifiOff className="h-3.5 w-3.5" />}
                  {marketFeedLabel}
                </span>
              </div>
              <p className="text-sm text-slate-300">
                Search pairs, monitor movers, and follow the selected pair with responsive candlesticks.
              </p>
            </div>

            <Link href={buildMarketSelectionPath("/demo-trading", selectedSymbol, selectedInterval)}>
              <Button className="gap-2">
                <CandlestickChart className="h-4 w-4" />
                Open Demo Trading
              </Button>
            </Link>
          </div>

          <div className="grid gap-3 lg:grid-cols-[1fr_280px]">
            <label className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search BTC/USDT, ETH, SOL..."
                className="h-11 w-full rounded-xl border border-zinc-700 bg-zinc-950/80 pl-10 pr-4 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:ring-2 focus:ring-emerald-500"
              />
            </label>

            <select
              value={selectedSymbol}
              onChange={(event) => setSelectedSymbol(event.target.value)}
              className="h-11 rounded-xl border border-zinc-700 bg-zinc-950/80 px-3 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500"
            >
              {selectablePairs.map((pair) => (
                <option key={pair.symbol} value={pair.symbol}>
                  {pair.displaySymbol}
                </option>
              ))}
            </select>
          </div>
          <p className="text-[11px] text-slate-500">
            {isSelectionSynced ? "Selection synced to URL." : "Syncing selection..."}
          </p>
        </CardContent>
      </Card>

      {error ? (
        <Card className="border-red-700/30 bg-red-950/20">
          <CardContent className="pt-6">
            <p className="text-sm text-red-200">{error}</p>
          </CardContent>
        </Card>
      ) : null}

      <Card className="border-emerald-900/50 bg-gradient-to-br from-zinc-950 via-zinc-950 to-emerald-950/20">
        <CardHeader className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-xl">Live Market List</CardTitle>
              <CardDescription>
                Exchange-style market board with large-cap, meme, L1/L2, DeFi, stablecoins, and AI/Web3 assets.
              </CardDescription>
              <p className="mt-1 text-xs text-slate-500">
                {lastUpdated ? `Last updated ${lastUpdated.toLocaleTimeString()}` : marketLoading ? "Loading live feed..." : "Waiting for live snapshot..."}
              </p>
              <p
                className={`mt-1 text-[11px] ${
                  marketFeedMode === "LIVE"
                    ? "text-emerald-300"
                    : marketFeedMode === "CACHED"
                      ? "text-amber-300"
                      : "text-red-300"
                }`}
              >
                {marketFeedMode === "LIVE"
                  ? "Live market data"
                  : marketFeedMode === "CACHED"
                    ? "Using cached market snapshot"
                    : "Live feed offline"}
              </p>
            </div>
            <div className="flex gap-2">
              <label className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  value={marketSearch}
                  onChange={(event) => setMarketSearch(event.target.value)}
                  placeholder="Search coin or symbol"
                  className="h-10 rounded-xl border border-zinc-700 bg-zinc-950/80 pl-9 pr-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:ring-2 focus:ring-emerald-500"
                />
              </label>
              <select
                value={marketSort}
                onChange={(event) => setMarketSort(event.target.value as MarketSortOption)}
                className="h-10 rounded-xl border border-zinc-700 bg-zinc-950/80 px-3 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {MARKET_SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {MARKET_CATEGORIES.map((category) => (
              <button
                key={category}
                onClick={() => setMarketCategory(category)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  marketCategory === category
                    ? "border-emerald-600/70 bg-emerald-600/15 text-emerald-200"
                    : "border-zinc-700 bg-zinc-900/70 text-slate-300 hover:border-zinc-600"
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          {marketLoading && fullMarketRows.length === 0 ? (
            <p className="rounded-xl border border-zinc-800 bg-zinc-950/70 px-3 py-4 text-sm text-slate-400">
              Loading live market...
            </p>
          ) : null}
          {marketError ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-800/40 bg-amber-950/20 px-3 py-2 text-xs text-amber-200">
              <span>Live feed notice: {marketError}</span>
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2.5 text-[11px]"
                disabled={isRetryCoolingDown || marketLoading}
                onClick={() => {
                  if (isRetryCoolingDown) return;
                  setIsRetryCoolingDown(true);
                  if (retryCooldownTimerRef.current !== null) {
                    window.clearTimeout(retryCooldownTimerRef.current);
                  }
                  retryCooldownTimerRef.current = window.setTimeout(() => {
                    setIsRetryCoolingDown(false);
                    retryCooldownTimerRef.current = null;
                  }, MANUAL_RETRY_COOLDOWN_MS);
                  setMarketError(null);
                  setMarketLoading(true);
                  setMarketFeedMode(hasMarketSnapshotRef.current ? "CACHED" : "OFFLINE");
                  setMarketRefreshNonce((current) => current + 1);
                }}
              >
                {isRetryCoolingDown ? "Please wait..." : "Retry"}
              </Button>
            </div>
          ) : null}

          {fullMarketRows.length > 0 ? (
            <>
              <div className="hidden overflow-x-auto lg:block">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800 text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-3 py-3">Asset</th>
                      <th className="px-3 py-3">Price</th>
                      <th className="px-3 py-3">24h</th>
                      <th className="px-3 py-3">Market Cap</th>
                      <th className="px-3 py-3">Volume (24h)</th>
                      <th className="px-3 py-3">Trend</th>
                      <th className="px-3 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fullMarketRows.map((coin) => {
                      const pairSymbol = toUsdtPairSymbol(coin.symbol);
                      return (
                        <MarketTableRow
                          key={coin.id}
                          coin={coin}
                          pairSymbol={pairSymbol}
                          sparklinePoints={pairSymbol ? sparklineBySymbol[pairSymbol] ?? [] : []}
                          onOpenPair={openDemoTrading}
                        />
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="grid gap-3 lg:hidden">
                {fullMarketRows.map((coin) => {
                  const pairSymbol = toUsdtPairSymbol(coin.symbol);
                  return (
                    <MarketMobileCard
                      key={`mobile-${coin.id}`}
                      coin={coin}
                      pairSymbol={pairSymbol}
                      sparklinePoints={pairSymbol ? sparklineBySymbol[pairSymbol] ?? [] : []}
                      onOpenPair={openDemoTrading}
                    />
                  );
                })}
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4">
              <div>
                <CardTitle className="text-xl">{activePairLabel}</CardTitle>
                <CardDescription>Live spot price, 24h move, and responsive candlestick view</CardDescription>
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
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-5">
                <MetricCard
                  title="Last Price"
                  value={displayedLastPrice ? formatPrice(displayedLastPrice) : "-"}
                  accent="text-white"
                />
                <MetricCard
                  title="24h Change"
                  value={displayedChangePercent ? formatPercent(displayedChangePercent) : "-"}
                  accent={displayedChangePercent ? toneForChange(displayedChangePercent) : "text-slate-200"}
                />
                <MetricCard
                  title="24h High"
                  value={displayedHighPrice ? formatPrice(displayedHighPrice) : "-"}
                  accent="text-slate-100"
                />
                <MetricCard
                  title="24h Low"
                  value={displayedLowPrice ? formatPrice(displayedLowPrice) : "-"}
                  accent="text-slate-100"
                />
                <MetricCard
                  title="24h Volume"
                  value={displayedVolume ? formatVolume(displayedVolume) : "-"}
                  accent="text-slate-100"
                />
              </div>

              {chartBootstrapError ? (
                <div className="flex items-center justify-between rounded-xl border border-amber-800/40 bg-amber-950/20 px-3 py-2 text-xs text-amber-200">
                  <span>Chart bootstrap notice: {chartBootstrapError}</span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2.5 text-[11px]"
                    onClick={() => setChartRefreshNonce((current) => current + 1)}
                  >
                    Retry
                  </Button>
                </div>
              ) : null}

              <MarketChartShell
                candles={candles}
                symbol={selectedSymbol}
                interval={selectedInterval}
                currentPrice={displayedLastPrice}
                streamState={chartStreamState}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Search Results</CardTitle>
              <CardDescription>Filtered USDT spot pairs for quick pair rotation</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              {searchResults.slice(0, 10).map((pair) => (
                <button
                  key={pair.symbol}
                  onClick={() => setSelectedSymbol(pair.symbol)}
                  className={`rounded-2xl border p-4 text-left transition ${
                    pair.symbol === selectedSymbol
                      ? "border-emerald-700/50 bg-emerald-950/20"
                      : "border-zinc-800 bg-zinc-950/50 hover:border-zinc-700"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white">{pair.displaySymbol}</p>
                      <p className="text-xs text-slate-500">Vol {formatVolume(pair.quoteVolume)}</p>
                    </div>
                    <p className={`text-sm font-medium ${toneForChange(pair.priceChangePercent)}`}>
                      {formatPercent(pair.priceChangePercent)}
                    </p>
                  </div>
                  <p className="mt-3 text-lg font-semibold text-slate-100">{formatPrice(pair.lastPrice)}</p>
                </button>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Watchlist</CardTitle>
              <CardDescription>Major pairs with live updates</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {overviewPairs.map((pair) => (
                <button
                  key={pair.symbol}
                  onClick={() => setSelectedSymbol(pair.symbol)}
                  className={`grid w-full gap-2 rounded-xl border p-3 text-left transition md:grid-cols-[1fr_auto] md:items-center ${
                    pair.symbol === selectedSymbol
                      ? "border-emerald-700/50 bg-emerald-950/20"
                      : "border-zinc-800 bg-zinc-950/60 hover:border-zinc-700"
                  }`}
                >
                  <div>
                    <p className="text-sm font-medium text-slate-100">{pair.displaySymbol}</p>
                    <p className="text-xs text-slate-500">{formatVolume(pair.quoteVolume)} quote volume</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-white">{formatPrice(pair.lastPrice)}</p>
                    <p className={`text-xs ${toneForChange(pair.priceChangePercent)}`}>
                      {formatPercent(pair.priceChangePercent)}
                    </p>
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-2">
            <OrderBook symbol={selectedSymbol} orderBook={orderBook} />
            <RecentTradesFeed symbol={selectedSymbol} trades={recentTrades} />
          </div>

          <MoversCard title="Top Gainers" icon={<ArrowUpRight className="h-4 w-4 text-emerald-300" />} pairs={topGainers} />
          <MoversCard title="Top Losers" icon={<ArrowDownRight className="h-4 w-4 text-red-300" />} pairs={topLosers} />

          <Card className="border-emerald-900/40 bg-gradient-to-br from-zinc-950 via-zinc-950 to-emerald-950/30">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <div className="rounded-xl border border-emerald-700/30 bg-emerald-500/10 p-2">
                  <BarChart3 className="h-5 w-5 text-emerald-300" />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-white">Phase 1 live feed is isolated from wallet balances</p>
                  <p className="text-sm text-slate-400">
                    The markets module is read-only today, backed by live Binance spot data, and keeps the existing wallet, offers, and trade flows untouched.
                  </p>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <Activity className="h-3.5 w-3.5" />
                    {marketFeedStatus === "LIVE_WEBSOCKET"
                      ? "WebSocket stream active with REST safety net."
                      : marketFeedStatus === "LIVE_POLLING"
                        ? "WebSocket reconnecting; polling keeps prices live."
                        : "REST fallback active while websocket reconnects."}
                  </div>
                  {process.env.NODE_ENV !== "production" ? (
                    <div className="text-[11px] text-slate-500">
                      socket={socketLifecycleState} last-data={lastSocketDataAt ? new Date(lastSocketDataAt).toLocaleTimeString() : "-"} last-failure={lastSocketFailureAt ? new Date(lastSocketFailureAt).toLocaleTimeString() : "-"}
                    </div>
                  ) : null}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {loading ? <p className="text-sm text-slate-500">Loading live market data...</p> : null}
    </section>
  );
}

export default function MarketsPage() {
  return (
    <Suspense
      fallback={
        <section className="space-y-2">
          <p className="text-xs uppercase tracking-[0.2em] text-emerald-300">Xorviqa Markets</p>
          <p className="text-sm text-slate-400">Loading market workspace...</p>
        </section>
      }
    >
      <MarketsPageContent />
    </Suspense>
  );
}

function MetricCard({
  title,
  value,
  accent,
}: {
  title: string;
  value: string;
  accent: string;
}) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{title}</p>
      <p className={`mt-2 text-lg font-semibold ${accent}`}>{value}</p>
    </div>
  );
}

function MoversCard({
  title,
  icon,
  pairs,
}: {
  title: string;
  icon: ReactNode;
  pairs: MarketTickerSnapshot[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          {icon}
          {title}
        </CardTitle>
        <CardDescription>24h movers from the tracked spot universe</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {pairs.map((pair) => (
          <div key={`${title}-${pair.symbol}`} className="grid gap-1 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <p className="text-sm font-medium text-slate-100">{pair.displaySymbol}</p>
              <p className="text-xs text-slate-500">{formatVolume(pair.quoteVolume)} quote volume</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-white">{formatPrice(pair.lastPrice)}</p>
              <p className={`text-xs ${toneForChange(pair.priceChangePercent)}`}>
                {formatPercent(pair.priceChangePercent)}
              </p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

interface MarketListItemProps {
  coin: LiveMarketCoin;
  pairSymbol: string;
  sparklinePoints: SparklinePoint[];
  onOpenPair: (pairSymbol: string) => void;
}

const MarketTableRow = memo(function MarketTableRow({
  coin,
  pairSymbol,
  sparklinePoints,
  onOpenPair,
}: MarketListItemProps) {
  const isPositive =
    sparklinePoints.length >= 2
      ? sparklinePoints[sparklinePoints.length - 1].value >= sparklinePoints[0].value
      : coin.change24h >= 0;
  const rowClickable = pairSymbol.length > 0;

  return (
    <tr
      className={`border-b border-zinc-900/80 text-slate-100 transition ${
        rowClickable ? "cursor-pointer hover:bg-zinc-900/40" : ""
      }`}
      onClick={rowClickable ? () => onOpenPair(pairSymbol) : undefined}
      onKeyDown={
        rowClickable
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onOpenPair(pairSymbol);
              }
            }
          : undefined
      }
      role={rowClickable ? "button" : undefined}
      tabIndex={rowClickable ? 0 : -1}
      aria-label={rowClickable ? `Open ${coin.symbol} in demo trading` : undefined}
    >
      <td className="px-3 py-3">
        <div className="flex items-center gap-3">
          <img
            src={coin.icon}
            alt={`${coin.name} logo`}
            className="h-10 w-10 rounded-full bg-transparent object-contain"
            loading="lazy"
            decoding="async"
            onError={(event) => {
              event.currentTarget.onerror = null;
              event.currentTarget.src = FALLBACK_COIN_ICON;
            }}
          />
          <div>
            <p className="font-semibold">{coin.name}</p>
            <p className="text-xs text-slate-500">{coin.symbol}</p>
          </div>
        </div>
      </td>
      <td className="px-3 py-3 text-white font-medium">{formatUsd(coin.price)}</td>
      <td className={`px-3 py-3 font-semibold ${coin.change24h >= 0 ? "text-emerald-400" : "text-red-400"}`}>
        {coin.change24h >= 0 ? "+" : ""}
        {coin.change24h.toFixed(2)}%
      </td>
      <td className="px-3 py-3 text-slate-300">${formatCompact(coin.marketCap)}</td>
      <td className="px-3 py-3 text-slate-300">${formatCompact(coin.volume24h)}</td>
      <td className="px-3 py-3">
        <MarketSparkline points={sparklinePoints} positive={isPositive} />
      </td>
      <td className="px-3 py-3">
        <div className="flex justify-end gap-2">
          <Button
            size="sm"
            className="h-8 px-3"
            onClick={(event) => {
              event.stopPropagation();
              onOpenPair(pairSymbol);
            }}
            disabled={!rowClickable}
          >
            Buy
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 px-3"
            onClick={(event) => {
              event.stopPropagation();
              onOpenPair(pairSymbol);
            }}
            disabled={!rowClickable}
          >
            Trade
          </Button>
        </div>
      </td>
    </tr>
  );
});

const MarketMobileCard = memo(function MarketMobileCard({
  coin,
  pairSymbol,
  sparklinePoints,
  onOpenPair,
}: MarketListItemProps) {
  const isPositive =
    sparklinePoints.length >= 2
      ? sparklinePoints[sparklinePoints.length - 1].value >= sparklinePoints[0].value
      : coin.change24h >= 0;
  const rowClickable = pairSymbol.length > 0;

  return (
    <article
      className={`rounded-2xl border border-zinc-800 bg-zinc-950/60 p-3 transition ${
        rowClickable ? "cursor-pointer hover:border-emerald-700/40" : ""
      }`}
      onClick={rowClickable ? () => onOpenPair(pairSymbol) : undefined}
      onKeyDown={
        rowClickable
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onOpenPair(pairSymbol);
              }
            }
          : undefined
      }
      role={rowClickable ? "button" : undefined}
      tabIndex={rowClickable ? 0 : -1}
      aria-label={rowClickable ? `Open ${coin.symbol} in demo trading` : undefined}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <img
            src={coin.icon}
            alt={`${coin.name} logo`}
            className="h-10 w-10 rounded-full bg-transparent object-contain"
            loading="lazy"
            decoding="async"
            onError={(event) => {
              event.currentTarget.onerror = null;
              event.currentTarget.src = FALLBACK_COIN_ICON;
            }}
          />
          <div>
            <p className="text-sm font-semibold text-slate-100">{coin.name}</p>
            <p className="text-xs text-slate-500">{coin.symbol}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm font-medium text-white">{formatUsd(coin.price)}</p>
          <p className={`text-xs font-semibold ${coin.change24h >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {coin.change24h >= 0 ? "+" : ""}
            {coin.change24h.toFixed(2)}%
          </p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-400">
        <p>MCap: ${formatCompact(coin.marketCap)}</p>
        <p>Vol: ${formatCompact(coin.volume24h)}</p>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <MarketSparkline points={sparklinePoints} positive={isPositive} className="w-[140px]" />
        <div className="flex gap-2">
          <Button
            size="sm"
            className="h-8 px-3"
            onClick={(event) => {
              event.stopPropagation();
              onOpenPair(pairSymbol);
            }}
            disabled={!rowClickable}
          >
            Buy
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 px-3"
            onClick={(event) => {
              event.stopPropagation();
              onOpenPair(pairSymbol);
            }}
            disabled={!rowClickable}
          >
            Trade
          </Button>
        </div>
      </div>
    </article>
  );
});

function mergeTickers(
  current: MarketTickerSnapshot[],
  updates: MarketTickerSnapshot[],
  preferredOrder?: string[],
) {
  const map = new Map(current.map((pair) => [pair.symbol, pair]));
  updates.forEach((ticker) => {
    map.set(ticker.symbol, ticker);
  });

  const items = [...map.values()];
  if (!preferredOrder) {
    return items;
  }

  const rank = new Map(preferredOrder.map((symbol, index) => [symbol, index]));
  return items.sort((left, right) => {
    const leftRank = rank.get(left.symbol);
    const rightRank = rank.get(right.symbol);
    if (leftRank !== undefined || rightRank !== undefined) {
      return (leftRank ?? Number.MAX_SAFE_INTEGER) - (rightRank ?? Number.MAX_SAFE_INTEGER);
    }
    return right.updatedAt - left.updatedAt;
  });
}

function replaceTicker(current: MarketTickerSnapshot[], ticker: MarketTickerSnapshot) {
  const next = current.map((pair) => (pair.symbol === ticker.symbol ? ticker : pair));
  return next.some((pair) => pair.symbol === ticker.symbol) ? next : current;
}

