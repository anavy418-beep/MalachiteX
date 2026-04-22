import { io } from "socket.io-client";
import { apiRequest } from "@/lib/api";
import {
  resolvedPublicApiBaseUrl,
  resolvedPublicApiSocketUrl,
} from "@/lib/runtime-config";

export const MARKET_TIMEFRAMES = ["1m", "5m", "15m", "1h", "4h", "1d"] as const;
const API_BASE_URL = resolvedPublicApiBaseUrl;

if (!API_BASE_URL && process.env.NODE_ENV === "production") {
  throw new Error("NEXT_PUBLIC_API_BASE_URL or NEXT_PUBLIC_API_URL must be configured in production.");
}

const RESOLVED_API_BASE_URL = API_BASE_URL || "http://localhost:4000/api";
const API_SOCKET_URL = resolvedPublicApiSocketUrl;
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

function buildFallbackOverview(symbols: string[]) {
  const normalizedSymbols = symbols
    .map((symbol) => normalizeOrderBookSymbol(symbol))
    .filter((symbol) => symbol.length >= 6 && symbol.length <= 20);
  const sourceSymbols = normalizedSymbols.length > 0 ? normalizedSymbols : FALLBACK_PAIR_SYMBOLS.slice(0, 8);
  const pairs = sourceSymbols.map((symbol, index) => buildFallbackTicker(symbol, index));
  const sortedByChange = [...pairs].sort(
    (left, right) =>
      Number.parseFloat(right.priceChangePercent) - Number.parseFloat(left.priceChangePercent),
  );

  return {
    pairs,
    topGainers: sortedByChange.slice(0, 5),
    topLosers: [...sortedByChange].reverse().slice(0, 5),
    source: "binance" as const,
    streaming: false,
    updatedAt: Date.now(),
  } satisfies MarketOverviewResponse;
}

function coerceOverviewPayload(payload: unknown): MarketOverviewResponse | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Partial<MarketOverviewResponse>;
  if (!Array.isArray(record.pairs)) {
    return null;
  }

  return {
    pairs: record.pairs,
    topGainers: Array.isArray(record.topGainers) ? record.topGainers : [],
    topLosers: Array.isArray(record.topLosers) ? record.topLosers : [],
    source: "binance",
    streaming: typeof record.streaming === "boolean" ? record.streaming : false,
    updatedAt: typeof record.updatedAt === "number" ? record.updatedAt : Date.now(),
  };
}

function coercePairsPayload(payload: unknown): MarketPairsResponse | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Partial<MarketPairsResponse>;
  if (!Array.isArray(record.pairs)) {
    return null;
  }

  return {
    pairs: record.pairs,
    updatedAt: typeof record.updatedAt === "number" ? record.updatedAt : Date.now(),
    source: "binance",
  };
}

export function toMarketDataErrorMessage(
  error: unknown,
  fallback = "Unable to load market data.",
) {
  const rawMessage = error instanceof Error ? error.message : String(error ?? "");
  const message = rawMessage.trim();
  if (!message) {
    return fallback;
  }

  if (
    /cannot get|failed to fetch|network|timeout|unexpected token|market endpoint not found|request failed/i.test(
      message,
    )
  ) {
    return fallback;
  }

  return message.length > 180 ? fallback : message;
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

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function normalizeApiBase(value: string) {
  const candidate = String(value ?? "").trim();
  if (!candidate) return "";
  return trimTrailingSlash(candidate);
}

function removeApiSuffix(value: string) {
  const normalized = normalizeApiBase(value);
  return normalized.endsWith("/api") ? normalized.slice(0, -4) : normalized;
}

type LocalOrderBookNumericLevel = {
  price: number;
  quantity: number;
};

type LocalOrderBookFlatPayload = {
  symbol?: unknown;
  bids?: unknown;
  asks?: unknown;
  bestBid?: unknown;
  bestAsk?: unknown;
  spread?: unknown;
  source?: unknown;
  updatedAt?: unknown;
  streaming?: unknown;
};

function toDecimalString(value: number, maxDigits = 8) {
  if (!Number.isFinite(value)) return "0";
  return value.toFixed(maxDigits).replace(/0+$/, "").replace(/\.$/, "") || "0";
}

function normalizeLocalOrderBookLevels(levels: LocalOrderBookNumericLevel[], side: "BID" | "ASK") {
  let cumulative = 0;
  return levels
    .map((level) => {
      const price = Number(level.price);
      const quantity = Number(level.quantity);
      if (!Number.isFinite(price) || !Number.isFinite(quantity) || price <= 0 || quantity <= 0) {
        return null;
      }
      cumulative += quantity;
      return {
        price: toDecimalString(price),
        quantity: toDecimalString(quantity),
        cumulativeQuantity: toDecimalString(cumulative),
        side,
      } satisfies MarketOrderBookLevel;
    })
    .filter((level): level is MarketOrderBookLevel => Boolean(level));
}

function parseOrderBookNumericLevels(input: unknown): LocalOrderBookNumericLevel[] {
  if (!Array.isArray(input)) return [];

  return input
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const record = entry as Record<string, unknown>;
      const price = Number(record.price);
      const quantity = Number(record.quantity);
      if (!Number.isFinite(price) || !Number.isFinite(quantity)) {
        return null;
      }
      return { price, quantity } satisfies LocalOrderBookNumericLevel;
    })
    .filter((level): level is LocalOrderBookNumericLevel => Boolean(level));
}

function coerceLocalOrderBookPayload(payload: unknown): MarketOrderBookResponse | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  if ("orderBook" in payload) {
    const typed = payload as Partial<MarketOrderBookResponse>;
    if (typed.orderBook && typed.symbol) {
      return typed as MarketOrderBookResponse;
    }
  }

  const flat = payload as LocalOrderBookFlatPayload;
  const symbolCandidate = normalizeOrderBookSymbol(String(flat.symbol ?? ""));
  const symbol =
    symbolCandidate.length >= 6 && symbolCandidate.length <= 20 ? symbolCandidate : "BTCUSDT";
  const bids = normalizeLocalOrderBookLevels(parseOrderBookNumericLevels(flat.bids), "BID");
  const asks = normalizeLocalOrderBookLevels(parseOrderBookNumericLevels(flat.asks), "ASK");
  const bestBid =
    Number.isFinite(Number(flat.bestBid)) && Number(flat.bestBid) > 0
      ? toDecimalString(Number(flat.bestBid))
      : bids[0]?.price ?? null;
  const bestAsk =
    Number.isFinite(Number(flat.bestAsk)) && Number(flat.bestAsk) > 0
      ? toDecimalString(Number(flat.bestAsk))
      : asks[0]?.price ?? null;
  const spread =
    Number.isFinite(Number(flat.spread)) && Number(flat.spread) >= 0 ? toDecimalString(Number(flat.spread)) : null;
  const updatedAt =
    typeof flat.updatedAt === "number" && Number.isFinite(flat.updatedAt) ? flat.updatedAt : Date.now();

  return {
    symbol,
    orderBook: {
      symbol,
      bids,
      asks,
      bestBid,
      bestAsk,
      spread,
      updatedAt,
      source: "binance",
      streaming: Boolean(flat.streaming),
    },
    source: "binance",
    updatedAt,
    streaming: Boolean(flat.streaming),
  };
}

async function fetchLocalOrderBook(params: URLSearchParams) {
  if (typeof window === "undefined") {
    return null;
  }

  const localResponse = await fetch(`/api/markets/order-book?${params.toString()}`, {
    cache: "no-store",
  });

  if (!localResponse.ok) {
    return null;
  }

  const localPayload = await localResponse.json().catch(() => null);
  return coerceLocalOrderBookPayload(localPayload);
}

async function fetchOrderBookFromCandidates(params: URLSearchParams) {
  if (typeof window === "undefined") {
    return null;
  }

  const query = params.toString();
  const suffix = query ? `?${query}` : "";
  const candidates = new Set<string>();

  candidates.add(`/api/markets/order-book${suffix}`);
  candidates.add(`/markets/order-book${suffix}`);

  const resolvedApiBase = normalizeApiBase(RESOLVED_API_BASE_URL);
  if (resolvedApiBase) {
    candidates.add(`${resolvedApiBase}/markets/order-book${suffix}`);
    const stripped = removeApiSuffix(resolvedApiBase);
    if (stripped && stripped !== resolvedApiBase) {
      candidates.add(`${stripped}/markets/order-book${suffix}`);
    }
  }

  const socketBase = normalizeApiBase(API_SOCKET_URL);
  if (socketBase) {
    candidates.add(`${socketBase}/api/markets/order-book${suffix}`);
    candidates.add(`${socketBase}/markets/order-book${suffix}`);
  }

  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate, {
        cache: "no-store",
        credentials: "include",
      });
      if (!response.ok) {
        continue;
      }

      const payload = await response.json().catch(() => null);
      const normalized = coerceLocalOrderBookPayload(payload);
      if (normalized) {
        return normalized;
      }
    } catch {
      // Continue through candidates until one succeeds.
    }
  }

  return null;
}

export const marketsService = {
  async getOverview(symbols: string[]) {
    const params = new URLSearchParams();
    if (symbols.length > 0) {
      params.set("symbols", symbols.join(","));
    }

    const suffix = params.toString() ? `?${params.toString()}` : "";
    const localRoutePath = `/api/markets/overview${suffix}`;

    if (typeof window !== "undefined") {
      try {
        const localResponse = await fetch(localRoutePath, {
          cache: "no-store",
        });
        if (localResponse.ok) {
          const localPayload = await localResponse.json().catch(() => null);
          const normalized = coerceOverviewPayload(localPayload);
          if (normalized) {
            return normalized;
          }
        }
      } catch {
        // Continue to backend/api fallbacks.
      }
    }

    try {
      const upstreamPayload = await apiRequest<MarketOverviewResponse>(`/markets/overview${suffix}`);
      const normalized = coerceOverviewPayload(upstreamPayload);
      if (normalized) {
        return normalized;
      }
    } catch (primaryError) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("getOverview fallback activated after API error:", primaryError);
      }
    }

    return buildFallbackOverview(symbols);
  },

  async searchPairs(search: string, limit = 20) {
    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    params.set("limit", String(limit));
    const localRoutePath = `/api/markets/pairs?${params.toString()}`;

    if (typeof window !== "undefined") {
      try {
        const localResponse = await fetch(localRoutePath, {
          cache: "no-store",
        });

        if (localResponse.ok) {
          const localPayload = await localResponse.json().catch(() => null);
          const normalized = coercePairsPayload(localPayload);
          if (normalized) {
            return normalized;
          }
        }
      } catch {
        // Continue to backend/api fallback.
      }
    }

    try {
      return await apiRequest<MarketPairsResponse>(`/markets/pairs?${params.toString()}`);
    } catch (primaryError) {
      if (typeof window !== "undefined") {
        try {
          const localResponse = await fetch(localRoutePath, {
            cache: "no-store",
          });

          if (localResponse.ok) {
            const localPayload = await localResponse.json().catch(() => null);
            const normalized = coercePairsPayload(localPayload);
            if (normalized) {
              return normalized;
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

    let localRouteError: unknown = null;
    if (typeof window !== "undefined") {
      try {
        const candidatePayload = await fetchOrderBookFromCandidates(params);
        if (candidatePayload) {
          return candidatePayload;
        }
        const localPayload = await fetchLocalOrderBook(params);
        if (localPayload) {
          return localPayload;
        }
      } catch (error) {
        localRouteError = error;
      }
    }

    try {
      return await apiRequest<MarketOrderBookResponse>(`/markets/order-book?${params.toString()}`);
    } catch (primaryError) {
      if (typeof window !== "undefined" && localRouteError === null) {
        try {
          const candidatePayload = await fetchOrderBookFromCandidates(params);
          if (candidatePayload) {
            return candidatePayload;
          }
          const localPayload = await fetchLocalOrderBook(params);
          if (localPayload) {
            return localPayload;
          }
        } catch (error) {
          localRouteError = error;
        }
      }

      if (process.env.NODE_ENV !== "production") {
        console.warn("getOrderBook fallback activated after API error:", primaryError);
        if (localRouteError) {
          console.warn("getOrderBook local route request error:", localRouteError);
        }
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
