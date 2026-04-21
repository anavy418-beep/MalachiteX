"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useDeferredValue, useEffect, useMemo, useState, type ReactNode } from "react";
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
import { MARKET_CATEGORIES, MOCK_MARKET_DATA, type MockMarketCoin } from "@/lib/mock-market-data";
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
  type MarketCandle,
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

function formatBillions(value: number) {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(2)}T`;
  }
  if (value >= 100) {
    return `${value.toFixed(0)}B`;
  }
  return `${value.toFixed(1)}B`;
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
  const [isSocketConnected, setIsSocketConnected] = useState(false);
  const [restFallback, setRestFallback] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const deferredSearch = useDeferredValue(search);

  const selectedPair = useMemo(
    () => [...overviewPairs, ...searchResults].find((pair) => pair.symbol === selectedSymbol) ?? null,
    [overviewPairs, searchResults, selectedSymbol],
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
    const filtered = MOCK_MARKET_DATA.filter((coin) => {
      if (marketCategory !== "All" && coin.category !== marketCategory) return false;
      if (!query) return true;
      return coin.name.toLowerCase().includes(query) || coin.symbol.toLowerCase().includes(query);
    });

    const sorted = [...filtered].sort((left, right) => {
      if (marketSort === "market_cap") return right.marketCapBillions - left.marketCapBillions;
      if (marketSort === "volume") return right.volume24hBillions - left.volume24hBillions;
      if (marketSort === "gainers") return right.change24h - left.change24h;
      if (marketSort === "losers") return left.change24h - right.change24h;
      if (marketSort === "price_high") return right.price - left.price;
      return left.price - right.price;
    });

    return sorted;
  }, [marketCategory, marketSearch, marketSort]);

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
        const [overview, pairSearch, candleResponse, orderBookResponse, recentTradesResponse] = await Promise.all([
          marketsService.getOverview(TRACKED_SYMBOLS),
          marketsService.searchPairs("", 16),
          marketsService.getCandles(selectedSymbol, selectedInterval),
          marketsService.getOrderBook(selectedSymbol, 20),
          marketsService.getRecentTrades(selectedSymbol, 50),
        ]);

        if (cancelled) return;

        setOverviewPairs(overview.pairs);
        setTopGainers(overview.topGainers);
        setTopLosers(overview.topLosers);
        setSearchResults(pairSearch.pairs);
        setCandles(candleResponse.candles);
        setOrderBook(orderBookResponse.orderBook);
        setRecentTrades(recentTradesResponse.trades);
        setRestFallback(!overview.streaming);
      } catch (err) {
        if (cancelled) return;
        const message = (err as Error).message;
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
  }, [selectedInterval, selectedSymbol]);

  useEffect(() => {
    const connection = marketsService.connectSocket({
      onConnect(connected) {
        setIsSocketConnected(connected);
        setRestFallback((current) => (connected ? false : current));
      },
      onBootstrap(tickers) {
        if (tickers.length === 0) return;
        setOverviewPairs((current) => mergeTickers(current, tickers, TRACKED_SYMBOLS));
      },
      onTicker(ticker) {
        setOverviewPairs((current) => mergeTickers(current, [ticker], TRACKED_SYMBOLS));
        setSearchResults((current) => mergeTickers(current, [ticker]));
        setTopGainers((current) => replaceTicker(current, ticker));
        setTopLosers((current) => replaceTicker(current, ticker));
      },
      onCandlesBootstrap(payload) {
        if (payload.symbol === selectedSymbol && payload.interval === selectedInterval) {
          setCandles(payload.candles);
        }
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
      onOrderBookBootstrap(payload) {
        if (payload.symbol === selectedSymbol) {
          setOrderBook(payload.orderBook);
        }
      },
      onOrderBook(nextOrderBook) {
        if (nextOrderBook.symbol === selectedSymbol) {
          setOrderBook(nextOrderBook);
        }
      },
      onTradesBootstrap(payload) {
        if (payload.symbol === selectedSymbol) {
          setRecentTrades(payload.trades);
        }
      },
      onTrade(trade) {
        if (trade.symbol !== selectedSymbol) return;
        setRecentTrades((current) => [trade, ...current.filter((entry) => entry.tradeId !== trade.tradeId)].slice(0, 60));
      },
    });

    connection.watchSymbols(TRACKED_SYMBOLS);
    connection.watchSymbols([selectedSymbol]);
    connection.watchCandles(selectedSymbol, selectedInterval);
    connection.watchOrderBook(selectedSymbol);
    connection.watchRecentTrades(selectedSymbol, 60);

    return () => {
      connection.unwatchSymbols(TRACKED_SYMBOLS);
      connection.unwatchSymbols([selectedSymbol]);
      connection.unwatchCandles(selectedSymbol, selectedInterval);
      connection.unwatchOrderBook(selectedSymbol);
      connection.unwatchRecentTrades(selectedSymbol);
      connection.disconnect();
    };
  }, [selectedInterval, selectedSymbol]);

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
    if (isSocketConnected) return;

    const interval = window.setInterval(() => {
      void (async () => {
        try {
          const [overview, candleResponse, orderBookResponse, recentTradesResponse] = await Promise.all([
            marketsService.getOverview(TRACKED_SYMBOLS),
            marketsService.getCandles(selectedSymbol, selectedInterval, 160),
            marketsService.getOrderBook(selectedSymbol, 20),
            marketsService.getRecentTrades(selectedSymbol, 60),
          ]);

          setOverviewPairs(overview.pairs);
          setTopGainers(overview.topGainers);
          setTopLosers(overview.topLosers);
          setCandles(candleResponse.candles);
          setOrderBook(orderBookResponse.orderBook);
          setRecentTrades(recentTradesResponse.trades);
          setRestFallback(true);
        } catch {
          setRestFallback(true);
        }
      })();
    }, 12_000);

    return () => window.clearInterval(interval);
  }, [isSocketConnected, selectedInterval, selectedSymbol]);

  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.2em] text-emerald-300">MalachiteX Markets</p>
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
                <span
                  className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs ${
                    isSocketConnected
                      ? "border-emerald-700/40 bg-emerald-500/10 text-emerald-200"
                      : "border-amber-700/40 bg-amber-500/10 text-amber-200"
                  }`}
                >
                  {isSocketConnected ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
                  {isSocketConnected ? "WebSocket live" : "REST fallback"}
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
                {fullMarketRows.map((coin) => (
                  <tr key={coin.symbol} className="border-b border-zinc-900/80 text-slate-100">
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
                    <td className="px-3 py-3">{formatUsd(coin.price)}</td>
                    <td className={`px-3 py-3 font-medium ${coin.change24h >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                      {coin.change24h >= 0 ? "+" : ""}
                      {coin.change24h.toFixed(2)}%
                    </td>
                    <td className="px-3 py-3 text-slate-300">${formatBillions(coin.marketCapBillions)}</td>
                    <td className="px-3 py-3 text-slate-300">${formatBillions(coin.volume24hBillions)}</td>
                    <td className="px-3 py-3">
                      <MiniTrend points={coin.trend} positive={coin.change24h >= 0} />
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" className="h-8 px-3">
                          Buy
                        </Button>
                        <Button size="sm" variant="outline" className="h-8 px-3">
                          Trade
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid gap-3 lg:hidden">
            {fullMarketRows.map((coin) => (
              <article key={`mobile-${coin.symbol}`} className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-3">
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
                    <p className="text-sm font-semibold text-white">{formatUsd(coin.price)}</p>
                    <p className={`text-xs ${coin.change24h >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                      {coin.change24h >= 0 ? "+" : ""}
                      {coin.change24h.toFixed(2)}%
                    </p>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-400">
                  <p>MCap: ${formatBillions(coin.marketCapBillions)}</p>
                  <p>Vol: ${formatBillions(coin.volume24hBillions)}</p>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <MiniTrend points={coin.trend} positive={coin.change24h >= 0} />
                  <div className="flex gap-2">
                    <Button size="sm" className="h-8 px-3">
                      Buy
                    </Button>
                    <Button size="sm" variant="outline" className="h-8 px-3">
                      Trade
                    </Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_360px]">
        <div className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4">
              <div>
                <CardTitle className="text-xl">{selectedPair?.displaySymbol ?? "Loading pair"}</CardTitle>
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
                  value={selectedPair ? formatPrice(selectedPair.lastPrice) : "-"}
                  accent="text-white"
                />
                <MetricCard
                  title="24h Change"
                  value={selectedPair ? formatPercent(selectedPair.priceChangePercent) : "-"}
                  accent={selectedPair ? toneForChange(selectedPair.priceChangePercent) : "text-slate-200"}
                />
                <MetricCard
                  title="24h High"
                  value={selectedPair ? formatPrice(selectedPair.highPrice) : "-"}
                  accent="text-slate-100"
                />
                <MetricCard
                  title="24h Low"
                  value={selectedPair ? formatPrice(selectedPair.lowPrice) : "-"}
                  accent="text-slate-100"
                />
                <MetricCard
                  title="24h Volume"
                  value={
                    selectedPair
                      ? formatVolume(selectedPair.quoteVolume)
                      : "-"
                  }
                  accent="text-slate-100"
                />
              </div>

              <MarketChartShell
                candles={candles}
                symbol={selectedSymbol}
                interval={selectedInterval}
                currentPrice={selectedPair?.lastPrice ?? null}
                streamState={isSocketConnected ? "LIVE" : restFallback ? "RECONNECTING" : "DELAYED"}
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

          <OrderBook symbol={selectedSymbol} orderBook={orderBook} />
          <RecentTradesFeed symbol={selectedSymbol} trades={recentTrades} />

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
                    {restFallback ? "Polling fallback active when streaming drops." : "Streaming active with REST safety net."}
                  </div>
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
          <p className="text-xs uppercase tracking-[0.2em] text-emerald-300">MalachiteX Markets</p>
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

function MiniTrend({
  points,
  positive,
}: {
  points: MockMarketCoin["trend"];
  positive: boolean;
}) {
  const max = Math.max(...points);
  const min = Math.min(...points);
  const normalized = points.map((point, index) => {
    const x = (index / (points.length - 1)) * 72;
    const y = max === min ? 12 : 22 - ((point - min) / (max - min)) * 20;
    return `${x},${y}`;
  });

  return (
    <svg viewBox="0 0 72 24" className="h-6 w-[72px]">
      <polyline
        fill="none"
        stroke={positive ? "#4ade80" : "#f87171"}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={normalized.join(" ")}
      />
    </svg>
  );
}

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

