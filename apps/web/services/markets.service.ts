import { io } from "socket.io-client";
import { apiRequest } from "@/lib/api";

export const MARKET_TIMEFRAMES = ["1m", "5m", "15m", "1h", "4h", "1d"] as const;
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

if (!API_BASE_URL && process.env.NODE_ENV === "production") {
  throw new Error("NEXT_PUBLIC_API_BASE_URL must be configured in production.");
}

const RESOLVED_API_BASE_URL = API_BASE_URL || "http://localhost:4000/api";

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

export const marketsService = {
  getOverview(symbols: string[]) {
    const params = new URLSearchParams();
    if (symbols.length > 0) {
      params.set("symbols", symbols.join(","));
    }

    const suffix = params.toString() ? `?${params.toString()}` : "";
    return apiRequest<MarketOverviewResponse>(`/markets/overview${suffix}`);
  },

  searchPairs(search: string, limit = 20) {
    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    params.set("limit", String(limit));
    return apiRequest<MarketPairsResponse>(`/markets/pairs?${params.toString()}`);
  },

  getCandles(symbol: string, interval: (typeof MARKET_TIMEFRAMES)[number], limit = 160) {
    const params = new URLSearchParams({
      symbol,
      interval,
      limit: String(limit),
    });

    return apiRequest<MarketCandlesResponse>(`/markets/candles?${params.toString()}`);
  },

  getOrderBook(symbol: string, limit = 20) {
    const params = new URLSearchParams({
      symbol,
      limit: String(limit),
    });

    return apiRequest<MarketOrderBookResponse>(`/markets/order-book?${params.toString()}`);
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
