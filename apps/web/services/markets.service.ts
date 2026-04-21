import { io } from "socket.io-client";
import { apiRequest } from "@/lib/api";

export const MARKET_TIMEFRAMES = ["1m", "5m", "15m", "1h", "4h", "1d"] as const;
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

if (!API_BASE_URL && process.env.NODE_ENV === "production") {
  throw new Error("NEXT_PUBLIC_API_BASE_URL must be configured in production.");
}

const RESOLVED_API_BASE_URL = API_BASE_URL || "http://localhost:4000/api";
const KNOWN_QUOTES = ["USDT", "USDC", "BTC", "ETH", "BNB", "TRY", "EUR", "GBP"] as const;
const DEFAULT_ORDER_BOOK_LIMIT = 20;
const ALLOWED_ORDER_BOOK_LIMITS = [5, 10, 20, 50, 100, 500, 1000] as const;
const FALLBACK_PAIR_SYMBOLS = [
  "BTCUSDT",
  "ETHUSDT",
  "SOLUSDT",
  "BNBUSDT",
  "XRPUSDT",
  "DOGEUSDT",
  "ADAUSDT",
  "AVAXUSDT",
  "LINKUSDT",
  "TONUSDT",
  "TRXUSDT",
  "LTCUSDT",
  "BCHUSDT",
  "SHIBUSDT",
  "DOTUSDT",
  "NEARUSDT",
  "MATICUSDT",
  "FILUSDT",
  "ATOMUSDT",
  "HBARUSDT",
];

export interface MarketTickerSnapshot {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  displaySymbol: string;
  lastPrice: string;
  openPrice: string;
  highPrice: string;
  lowPrice: string;
  priceChange: string;
  priceChangePercent: string;
  volume: string;
  quoteVolume: string;
  bidPrice: string;
  askPrice: string;
  tradeCount: number;
  openTime: number;
  closeTime: number;
  updatedAt: number;
  source: "binance";
  streaming: boolean;
}

export interface MarketCandle {
  symbol: string;
  interval: string;
  openTime: number;
  closeTime: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  quoteVolume: string;
  tradeCount: number;
  isClosed: boolean;
  updatedAt: number;
}

export interface MarketOrderBookLevel {
  price: string;
  quantity: string;
  cumulativeQuantity: string;
  side: "BID" | "ASK";
}

export interface MarketOrderBookSnapshot {
  symbol: string;
  bids: MarketOrderBookLevel[];
  asks: MarketOrderBookLevel[];
  bestBid: string | null;
  bestAsk: string | null;
  spread: string | null;
  updatedAt: number;
  source: "binance";
  streaming: boolean;
}

export interface MarketRecentTrade {
  symbol: string;
  tradeId: string;
  price: string;
  quantity: string;
  quoteQuantity: string;
  tradedAt: number;
  side: "BUY" | "SELL";
  updatedAt: number;
}

export interface MarketOverviewResponse {
  pairs: MarketTickerSnapshot[];
  topGainers: MarketTickerSnapshot[];
  topLosers: MarketTickerSnapshot[];
  source: "binance";
  streaming: boolean;
  updatedAt: number;
}

export interface MarketPairsResponse {
  pairs: MarketTickerSnapshot[];
  updatedAt: number;
  source: "binance";
}

export interface MarketCandlesResponse {
  symbol: string;
  interval: string;
  candles: MarketCandle[];
  source: "binance";
  updatedAt: number;
  streaming: boolean;
}

export interface MarketOrderBookResponse {
  symbol: string;
  orderBook: MarketOrderBookSnapshot;
  source: "binance";
  updatedAt: number;
  streaming: boolean;
}

export interface MarketRecentTradesResponse {
  symbol: string;
  trades: MarketRecentTrade[];
  source: "binance";
  updatedAt: number;
  streaming: boolean;
}

interface MarketsSocketHandlers {
  onConnect?: (connected: boolean) => void;
  onTicker?: (ticker: MarketTickerSnapshot) => void;
  onCandle?: (candle: MarketCandle) => void;
  onOrderBook?: (orderBook: MarketOrderBookSnapshot) => void;
  onTrade?: (trade: MarketRecentTrade) => void;
  onBootstrap?: (tickers: MarketTickerSnapshot[]) => void;
  onCandlesBootstrap?: (payload: { symbol: string; interval: string; candles: MarketCandle[] }) => void;
  onOrderBookBootstrap?: (payload: { symbol: string; orderBook: MarketOrderBookSnapshot }) => void;
  onTradesBootstrap?: (payload: { symbol: string; trades: MarketRecentTrade[] }) => void;
}

function getSocketBaseUrl() {
  try {
    return new URL(RESOLVED_API_BASE_URL).origin;
  } catch {
    return "http://localhost:4000";
  }
}

function splitMarketSymbol(symbol: string) {
  const upper = symbol.toUpperCase();
  for (const quote of KNOWN_QUOTES) {
    if (upper.endsWith(quote)) {
      return {
        baseAsset: upper.slice(0, upper.length - quote.length),
        quoteAsset: quote,
      };
    }
  }

  return {
    baseAsset: upper.slice(0, 3),
    quoteAsset: upper.slice(3),
  };
}

function buildFallbackTicker(symbol: string, index: number): MarketTickerSnapshot {
  const { baseAsset, quoteAsset } = splitMarketSymbol(symbol);
  const now = Date.now();
  const baseline = (1000 + index * 37).toFixed(2);

  return {
    symbol,
    baseAsset,
    quoteAsset,
    displaySymbol: `${baseAsset}/${quoteAsset}`,
    lastPrice: baseline,
    openPrice: baseline,
    highPrice: baseline,
    lowPrice: baseline,
    priceChange: "0.00",
    priceChangePercent: "0.00",
    volume: "0.00",
    quoteVolume: "0.00",
    bidPrice: baseline,
    askPrice: baseline,
    tradeCount: 0,
    openTime: now - 86_400_000,
    closeTime: now,
    updatedAt: now,
    source: "binance",
    streaming: false,
  };
}

function filterFallbackPairs(search: string, limit: number) {
  const normalizedSearch = search.trim().toUpperCase().replace(/\s+/g, "");
  const snapshots = FALLBACK_PAIR_SYMBOLS.map((symbol, index) => buildFallbackTicker(symbol, index));

  const filtered = normalizedSearch
    ? snapshots.filter(
        (pair) =>
          pair.symbol.includes(normalizedSearch) ||
          pair.baseAsset.includes(normalizedSearch) ||
          pair.displaySymbol.replace("/", "").includes(normalizedSearch),
      )
    : snapshots;

  return filtered.slice(0, Math.max(1, limit));
}

function normalizeOrderBookSymbol(symbol: string) {
  return String(symbol ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function normalizeOrderBookLimit(limit: number) {
  if (!Number.isFinite(limit)) return DEFAULT_ORDER_BOOK_LIMIT;
  const rounded = Math.max(1, Math.floor(limit));
  return (
    ALLOWED_ORDER_BOOK_LIMITS.find((allowed) => allowed >= rounded) ??
    ALLOWED_ORDER_BOOK_LIMITS[ALLOWED_ORDER_BOOK_LIMITS.length - 1]
  );
}

function buildFallbackOrderBookSnapshot(symbol: string): MarketOrderBookSnapshot {
  return {
    symbol,
    bids: [],
    asks: [],
    bestBid: null,
    bestAsk: null,
    spread: null,
    updatedAt: Date.now(),
    source: "binance",
    streaming: false,
  };
}

export const marketsService = {
  getOverview(symbols: string[]) {
    const params = new URLSearchParams();
    if (symbols.length > 0) {
      params.set("symbols", symbols.join(","));
    }

    const suffix = params.toString() ? `?${params.toString()}` : "";
    return apiRequest<MarketOverviewResponse>(`/markets/overview${suffix}`);
  },

  async searchPairs(search: string, limit = 20) {
    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    params.set("limit", String(limit));

    try {
      return await apiRequest<MarketPairsResponse>(`/markets/pairs?${params.toString()}`);
    } catch (primaryError) {
      if (typeof window !== "undefined") {
        try {
          const localResponse = await fetch(`/api/markets/pairs?${params.toString()}`, {
            cache: "no-store",
          });

          if (localResponse.ok) {
            const localPayload = (await localResponse.json()) as MarketPairsResponse;
            if (localPayload && Array.isArray(localPayload.pairs)) {
              return localPayload;
            }
          }
        } catch {
          // Ignore local fallback fetch failures and return static fallback list.
        }
      }

      if (process.env.NODE_ENV !== "production") {
        console.warn("searchPairs fallback activated after API error:", primaryError);
      }

      return {
        pairs: filterFallbackPairs(search, limit),
        updatedAt: Date.now(),
        source: "binance",
      };
    }
  },

  getCandles(symbol: string, interval: (typeof MARKET_TIMEFRAMES)[number], limit = 160) {
    const params = new URLSearchParams({
      symbol,
      interval,
      limit: String(limit),
    });

    return apiRequest<MarketCandlesResponse>(`/markets/candles?${params.toString()}`);
  },

  async getOrderBook(symbol: string, limit = 20) {
    const normalizedSymbolCandidate = normalizeOrderBookSymbol(symbol);
    const normalizedSymbol =
      normalizedSymbolCandidate.length >= 6 && normalizedSymbolCandidate.length <= 20
        ? normalizedSymbolCandidate
        : "BTCUSDT";
    const normalizedLimit = normalizeOrderBookLimit(limit);
    const params = new URLSearchParams({
      symbol: normalizedSymbol,
      limit: String(normalizedLimit),
    });

    try {
      return await apiRequest<MarketOrderBookResponse>(`/markets/order-book?${params.toString()}`);
    } catch (primaryError) {
      if (typeof window !== "undefined") {
        try {
          const localResponse = await fetch(`/api/markets/order-book?${params.toString()}`, {
            cache: "no-store",
          });

          if (localResponse.ok) {
            const localPayload = (await localResponse.json()) as MarketOrderBookResponse;
            if (localPayload && localPayload.orderBook) {
              return localPayload;
            }
          }
        } catch {
          // Ignore local fallback fetch failures and return a safe empty snapshot.
        }
      }

      if (process.env.NODE_ENV !== "production") {
        console.warn("getOrderBook fallback activated after API error:", primaryError);
      }

      return {
        symbol: normalizedSymbol,
        orderBook: buildFallbackOrderBookSnapshot(normalizedSymbol),
        source: "binance",
        updatedAt: Date.now(),
        streaming: false,
      };
    }
  },

  getRecentTrades(symbol: string, limit = 40) {
    const params = new URLSearchParams({
      symbol,
      limit: String(limit),
    });

    return apiRequest<MarketRecentTradesResponse>(`/markets/recent-trades?${params.toString()}`);
  },

  connectSocket(handlers: MarketsSocketHandlers) {
    const socket = io(`${getSocketBaseUrl()}/markets`, {
      transports: ["websocket"],
      timeout: 8_000,
    } as any) as any;

    socket.on("connect", () => handlers.onConnect?.(true));
    socket.on("disconnect", () => handlers.onConnect?.(false));
    socket.on("market:ticker", (ticker: MarketTickerSnapshot) => handlers.onTicker?.(ticker));
    socket.on("market:candle", (candle: MarketCandle) => handlers.onCandle?.(candle));
    socket.on("market:orderbook", (orderBook: MarketOrderBookSnapshot) =>
      handlers.onOrderBook?.(orderBook),
    );
    socket.on("market:trade", (trade: MarketRecentTrade) => handlers.onTrade?.(trade));
    socket.on("market:bootstrap", (payload: { tickers: MarketTickerSnapshot[] }) =>
      handlers.onBootstrap?.(payload.tickers),
    );
    socket.on(
      "market:candles:bootstrap",
      (payload: { symbol: string; interval: string; candles: MarketCandle[] }) =>
        handlers.onCandlesBootstrap?.(payload),
    );
    socket.on(
      "market:orderbook:bootstrap",
      (payload: { symbol: string; orderBook: MarketOrderBookSnapshot }) =>
        handlers.onOrderBookBootstrap?.(payload),
    );
    socket.on(
      "market:trades:bootstrap",
      (payload: { symbol: string; trades: MarketRecentTrade[] }) =>
        handlers.onTradesBootstrap?.(payload),
    );

    return {
      socket,
      watchSymbols(symbols: string[]) {
        socket.emit("market:watch", { symbols });
      },
      unwatchSymbols(symbols: string[]) {
        socket.emit("market:unwatch", { symbols });
      },
      watchCandles(symbol: string, interval: (typeof MARKET_TIMEFRAMES)[number]) {
        socket.emit("market:candles:watch", { symbol, interval });
      },
      unwatchCandles(symbol: string, interval: (typeof MARKET_TIMEFRAMES)[number]) {
        socket.emit("market:candles:unwatch", { symbol, interval });
      },
      watchOrderBook(symbol: string) {
        socket.emit("market:orderbook:watch", { symbol });
      },
      unwatchOrderBook(symbol: string) {
        socket.emit("market:orderbook:unwatch", { symbol });
      },
      watchRecentTrades(symbol: string, limit = 40) {
        socket.emit("market:trades:watch", { symbol, limit });
      },
      unwatchRecentTrades(symbol: string) {
        socket.emit("market:trades:unwatch", { symbol });
      },
      disconnect() {
        socket.disconnect();
      },
    };
  },
};

export type MarketsSocketConnection = ReturnType<typeof marketsService.connectSocket>;
export type MarketsSocket = ReturnType<typeof io>;
