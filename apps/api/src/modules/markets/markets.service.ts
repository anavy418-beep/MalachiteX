import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from "@nestjs/common";
import WebSocket from "ws";
import { MARKET_TIMEFRAMES } from "./dto/get-market-candles.dto";
import type { MarketsGateway } from "./markets.gateway";

const BINANCE_REST_BASE_URL = "https://api.binance.com";
const BINANCE_STREAM_BASE_URL = "wss://data-stream.binance.vision/stream?streams=";
const DEFAULT_MARKET_SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "DOGEUSDT"];
const DEFAULT_EXCHANGE_STREAM_SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];
const CACHEABLE_CANDLE_LIMIT = 240;
const CACHEABLE_RECENT_TRADES_LIMIT = 200;
const DEFAULT_ORDER_BOOK_DEPTH = 20;
const SCALE_8 = 100000000n;
const KNOWN_QUOTES = ["USDT", "USDC", "BTC", "ETH", "BNB", "TRY", "EUR", "GBP"];

interface Binance24HourTicker {
  symbol: string;
  priceChange: string;
  priceChangePercent: string;
  weightedAvgPrice: string;
  prevClosePrice: string;
  lastPrice: string;
  lastQty: string;
  bidPrice: string;
  bidQty: string;
  askPrice: string;
  askQty: string;
  openPrice: string;
  highPrice: string;
  lowPrice: string;
  volume: string;
  quoteVolume: string;
  openTime: number;
  closeTime: number;
  firstId: number;
  lastId: number;
  count: number;
}

interface BinanceKlinePayload {
  t: number;
  T: number;
  s: string;
  i: string;
  o: string;
  c: string;
  h: string;
  l: string;
  v: string;
  q: string;
  n: number;
  x: boolean;
}

interface BinanceDepthRestPayload {
  lastUpdateId: number;
  bids: [string, string][];
  asks: [string, string][];
}

interface BinanceDepthStreamPayload {
  s?: string;
  lastUpdateId?: number;
  bids?: [string, string][];
  asks?: [string, string][];
}

interface BinanceRecentTradePayload {
  id: number;
  price: string;
  qty: string;
  quoteQty: string;
  time: number;
  isBuyerMaker: boolean;
  isBestMatch: boolean;
}

interface BinanceStreamTradePayload {
  s?: string;
  t?: number;
  p?: string;
  q?: string;
  T?: number;
  m?: boolean;
}

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

export interface OverviewResponse {
  pairs: MarketTickerSnapshot[];
  topGainers: MarketTickerSnapshot[];
  topLosers: MarketTickerSnapshot[];
  source: "binance";
  streaming: boolean;
  updatedAt: number;
}

@Injectable()
export class MarketsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MarketsService.name);
  private readonly tickerCache = new Map<string, MarketTickerSnapshot>();
  private readonly candleCache = new Map<string, MarketCandle[]>();
  private readonly orderBookCache = new Map<string, MarketOrderBookSnapshot>();
  private readonly recentTradesCache = new Map<string, MarketRecentTrade[]>();
  private readonly trackedTickerSymbols = new Set<string>(DEFAULT_MARKET_SYMBOLS);
  private readonly trackedCandleStreams = new Set<string>();
  private readonly trackedOrderBookSymbols = new Set<string>(DEFAULT_EXCHANGE_STREAM_SYMBOLS);
  private readonly trackedRecentTradesSymbols = new Set<string>(DEFAULT_EXCHANGE_STREAM_SYMBOLS);
  private readonly tickerListeners = new Set<(ticker: MarketTickerSnapshot) => void | Promise<void>>();
  private readonly orderBookListeners = new Set<
    (orderBook: MarketOrderBookSnapshot) => void | Promise<void>
  >();
  private pairUniverse: string[] = [...DEFAULT_MARKET_SYMBOLS];
  private ws: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private refreshTimer: NodeJS.Timeout | null = null;
  private streamingAvailable = false;
  private gateway: MarketsGateway | null = null;

  attachGateway(gateway: MarketsGateway) {
    this.gateway = gateway;
  }

  async onModuleInit() {
    await this.refreshUniverse();
    await Promise.all(
      DEFAULT_EXCHANGE_STREAM_SYMBOLS.map((symbol) =>
        Promise.all([
          this.ensureOrderBookSnapshot(symbol).catch(() => {}),
          this.ensureRecentTradesSnapshot(symbol).catch(() => {}),
        ]),
      ),
    );
    this.openStream();
    this.refreshTimer = setInterval(() => {
      void this.refreshUniverse();
    }, 60_000);
  }

  onModuleDestroy() {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.closeStream();
  }

  isStreamingAvailable() {
    return this.streamingAvailable;
  }

  normalizeSymbols(symbols: string[]) {
    return [...new Set(symbols.map((symbol) => this.normalizeSymbol(symbol)).filter(Boolean))];
  }

  registerTickerSymbols(symbols: string[]) {
    const normalized = this.normalizeSymbols(symbols);
    let changed = false;

    normalized.forEach((symbol) => {
      if (!this.trackedTickerSymbols.has(symbol)) {
        this.trackedTickerSymbols.add(symbol);
        changed = true;
      }
    });

    if (changed) {
      this.scheduleReconnect(250);
    }

    return normalized;
  }

  registerCandleStream(symbol: string, interval: (typeof MARKET_TIMEFRAMES)[number]) {
    const key = `${symbol}:${interval}`;
    if (!this.trackedCandleStreams.has(key)) {
      this.trackedCandleStreams.add(key);
      this.scheduleReconnect(250);
    }
  }

  registerOrderBookSymbols(symbols: string[]) {
    const normalized = this.normalizeSymbols(symbols);
    let changed = false;

    normalized.forEach((symbol) => {
      if (!this.trackedOrderBookSymbols.has(symbol)) {
        this.trackedOrderBookSymbols.add(symbol);
        changed = true;
      }
    });

    if (changed) {
      this.scheduleReconnect(250);
    }

    return normalized;
  }

  registerRecentTradesSymbols(symbols: string[]) {
    const normalized = this.normalizeSymbols(symbols);
    let changed = false;

    normalized.forEach((symbol) => {
      if (!this.trackedRecentTradesSymbols.has(symbol)) {
        this.trackedRecentTradesSymbols.add(symbol);
        changed = true;
      }
    });

    if (changed) {
      this.scheduleReconnect(250);
    }

    return normalized;
  }

  registerTickerListener(listener: (ticker: MarketTickerSnapshot) => void | Promise<void>) {
    this.tickerListeners.add(listener);
    return () => {
      this.tickerListeners.delete(listener);
    };
  }

  registerOrderBookListener(
    listener: (orderBook: MarketOrderBookSnapshot) => void | Promise<void>,
  ) {
    this.orderBookListeners.add(listener);
    return () => {
      this.orderBookListeners.delete(listener);
    };
  }

  getCachedSnapshots(symbols: string[]) {
    return this.normalizeSymbols(symbols)
      .map((symbol) => this.tickerCache.get(symbol))
      .filter((value): value is MarketTickerSnapshot => Boolean(value));
  }

  getCachedCandles(symbol: string, interval: string) {
    return this.candleCache.get(`${symbol}:${interval}`) ?? [];
  }

  getCachedOrderBook(symbol: string) {
    const normalizedSymbol = this.normalizeSymbol(symbol);
    if (!normalizedSymbol) return null;
    return this.orderBookCache.get(normalizedSymbol) ?? null;
  }

  getCachedRecentTrades(symbol: string) {
    const normalizedSymbol = this.normalizeSymbol(symbol);
    if (!normalizedSymbol) return [];
    return this.recentTradesCache.get(normalizedSymbol) ?? [];
  }

  getMarkPrice(symbol: string) {
    const normalizedSymbol = this.normalizeSymbol(symbol);
    if (!normalizedSymbol) return null;

    const orderBook = this.orderBookCache.get(normalizedSymbol);
    if (orderBook?.bestBid && orderBook.bestAsk) {
      const bestBidMinor = this.parseScaledDecimal(orderBook.bestBid);
      const bestAskMinor = this.parseScaledDecimal(orderBook.bestAsk);
      if (bestBidMinor > 0n && bestAskMinor > 0n && bestAskMinor >= bestBidMinor) {
        return this.formatScaledValue((bestBidMinor + bestAskMinor) / 2n);
      }
    }

    if (orderBook?.bestBid) {
      return orderBook.bestBid;
    }

    if (orderBook?.bestAsk) {
      return orderBook.bestAsk;
    }

    const ticker = this.tickerCache.get(normalizedSymbol);
    return ticker?.lastPrice ?? null;
  }

  async getMarkPriceMap(symbols: string[]) {
    const normalizedSymbols = this.normalizeSymbols(symbols);
    if (normalizedSymbols.length === 0) {
      return new Map<string, string>();
    }

    await this.ensureSnapshots(normalizedSymbols);
    await Promise.all(
      normalizedSymbols.map((symbol) =>
        this.ensureOrderBookSnapshot(symbol).catch(() => undefined),
      ),
    );

    const map = new Map<string, string>();
    normalizedSymbols.forEach((symbol) => {
      const markPrice = this.getMarkPrice(symbol);
      if (markPrice) {
        map.set(symbol, markPrice);
      }
    });
    return map;
  }

  async getOverview(rawSymbols?: string): Promise<OverviewResponse> {
    const symbols = this.parseRequestedSymbols(rawSymbols);
    await this.ensureSnapshots(symbols);

    const pairs = symbols
      .map((symbol) => this.tickerCache.get(symbol))
      .filter((value): value is MarketTickerSnapshot => Boolean(value));

    const moverSource = this.pairUniverse
      .map((symbol) => this.tickerCache.get(symbol))
      .filter((value): value is MarketTickerSnapshot => Boolean(value));

    const movers = moverSource.sort(
      (left, right) =>
        Number.parseFloat(right.priceChangePercent) - Number.parseFloat(left.priceChangePercent),
    );

    return {
      pairs,
      topGainers: movers.slice(0, 5),
      topLosers: [...movers].reverse().slice(0, 5),
      source: "binance",
      streaming: this.streamingAvailable,
      updatedAt: Date.now(),
    };
  }

  async searchPairs(search = "", limit = 20) {
    if (this.pairUniverse.length === 0) {
      await this.refreshUniverse();
    }

    const query = search.trim().toUpperCase().replace(/\s+/g, "");
    const candidates = this.pairUniverse
      .map((symbol) => this.tickerCache.get(symbol))
      .filter((value): value is MarketTickerSnapshot => Boolean(value))
      .filter((pair) => {
        if (!query) return true;
        return (
          pair.symbol.includes(query) ||
          pair.displaySymbol.replace("/", "").includes(query) ||
          pair.baseAsset.includes(query)
        );
      })
      .sort(
        (left, right) => Number.parseFloat(right.quoteVolume) - Number.parseFloat(left.quoteVolume),
      )
      .slice(0, limit);

    return {
      pairs: candidates,
      updatedAt: Date.now(),
      source: "binance" as const,
    };
  }

  async getCandles(
    symbol: string,
    interval: (typeof MARKET_TIMEFRAMES)[number],
    limit = 160,
  ) {
    const normalizedSymbol = this.normalizeSymbol(symbol);
    if (!normalizedSymbol) {
      throw new ServiceUnavailableException("Invalid symbol.");
    }

    const response = await fetch(
      `${BINANCE_REST_BASE_URL}/api/v3/klines?symbol=${normalizedSymbol}&interval=${interval}&limit=${limit}`,
      { cache: "no-store" },
    );

    if (!response.ok) {
      throw new ServiceUnavailableException("Unable to load market candles.");
    }

    const payload = (await response.json()) as [
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
      string,
    ][];

    const candles = payload.map((entry) =>
      this.normalizeCandle(
        {
          t: entry[0],
          T: entry[6],
          s: normalizedSymbol,
          i: interval,
          o: entry[1],
          h: entry[2],
          l: entry[3],
          c: entry[4],
          v: entry[5],
          q: entry[7],
          n: entry[8],
          x: true,
        },
        false,
      ),
    );

    this.candleCache.set(`${normalizedSymbol}:${interval}`, candles.slice(-CACHEABLE_CANDLE_LIMIT));

    return {
      symbol: normalizedSymbol,
      interval,
      candles,
      source: "binance" as const,
      updatedAt: Date.now(),
      streaming: this.streamingAvailable,
    };
  }

  async getOrderBook(symbol: string, depth = DEFAULT_ORDER_BOOK_DEPTH) {
    const normalizedSymbol = this.normalizeSymbol(symbol);
    if (!normalizedSymbol) {
      throw new ServiceUnavailableException("Invalid symbol.");
    }

    this.registerOrderBookSymbols([normalizedSymbol]);
    await this.ensureOrderBookSnapshot(normalizedSymbol, depth);
    const snapshot = this.orderBookCache.get(normalizedSymbol);
    if (!snapshot) {
      throw new ServiceUnavailableException("Unable to load order book.");
    }

    return {
      symbol: normalizedSymbol,
      orderBook: snapshot,
      source: "binance" as const,
      streaming: this.streamingAvailable,
      updatedAt: Date.now(),
    };
  }

  async getRecentTrades(symbol: string, limit = 40) {
    const normalizedSymbol = this.normalizeSymbol(symbol);
    if (!normalizedSymbol) {
      throw new ServiceUnavailableException("Invalid symbol.");
    }

    this.registerRecentTradesSymbols([normalizedSymbol]);
    await this.ensureRecentTradesSnapshot(normalizedSymbol, limit);
    const trades = this.recentTradesCache.get(normalizedSymbol) ?? [];

    return {
      symbol: normalizedSymbol,
      trades: trades.slice(0, this.normalizeRecentTradeLimit(limit)),
      source: "binance" as const,
      streaming: this.streamingAvailable,
      updatedAt: Date.now(),
    };
  }

  private async refreshUniverse() {
    try {
      const response = await fetch(`${BINANCE_REST_BASE_URL}/api/v3/ticker/24hr`, {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`Binance returned ${response.status}`);
      }

      const payload = (await response.json()) as Binance24HourTicker[];
      const normalized = payload
        .filter((ticker) => this.isSupportedSpotPair(ticker.symbol))
        .map((ticker) => this.normalizeTicker(ticker, false))
        .sort(
          (left, right) => Number.parseFloat(right.quoteVolume) - Number.parseFloat(left.quoteVolume),
        );

      normalized.forEach((ticker) => {
        this.tickerCache.set(ticker.symbol, ticker);
      });

      this.pairUniverse = [
        ...new Set([
          ...DEFAULT_MARKET_SYMBOLS,
          ...normalized.slice(0, 80).map((ticker) => ticker.symbol),
        ]),
      ];
    } catch (error) {
      this.logger.warn(
        `Markets universe refresh failed: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
  }

  private async ensureSnapshots(symbols: string[]) {
    const missing = symbols.filter((symbol) => !this.tickerCache.has(symbol));
    if (missing.length === 0) return;

    const response = await fetch(
      `${BINANCE_REST_BASE_URL}/api/v3/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(missing))}`,
      { cache: "no-store" },
    );

    if (!response.ok) {
      throw new ServiceUnavailableException("Unable to load market data.");
    }

    const payload = (await response.json()) as Binance24HourTicker[];
    payload.forEach((ticker) => {
      this.tickerCache.set(ticker.symbol, this.normalizeTicker(ticker, false));
    });
  }

  private async ensureOrderBookSnapshot(symbol: string, rawDepth = DEFAULT_ORDER_BOOK_DEPTH) {
    const depth = this.normalizeOrderBookDepth(rawDepth);
    const response = await fetch(
      `${BINANCE_REST_BASE_URL}/api/v3/depth?symbol=${symbol}&limit=${depth}`,
      { cache: "no-store" },
    );

    if (!response.ok) {
      throw new ServiceUnavailableException("Unable to load order book.");
    }

    const payload = (await response.json()) as BinanceDepthRestPayload;
    const snapshot = this.normalizeOrderBook(
      symbol,
      payload.bids ?? [],
      payload.asks ?? [],
      false,
      payload.lastUpdateId,
    );
    this.orderBookCache.set(symbol, snapshot);
  }

  private async ensureRecentTradesSnapshot(symbol: string, rawLimit = 40) {
    const limit = this.normalizeRecentTradeLimit(rawLimit);
    const response = await fetch(
      `${BINANCE_REST_BASE_URL}/api/v3/trades?symbol=${symbol}&limit=${limit}`,
      { cache: "no-store" },
    );

    if (!response.ok) {
      throw new ServiceUnavailableException("Unable to load recent trades.");
    }

    const payload = (await response.json()) as BinanceRecentTradePayload[];
    const trades = payload
      .map((trade) =>
        this.normalizeRecentTrade(
          symbol,
          trade.id,
          trade.price,
          trade.qty,
          trade.quoteQty,
          trade.time,
          trade.isBuyerMaker ? "SELL" : "BUY",
        ),
      )
      .sort((left, right) => right.tradedAt - left.tradedAt)
      .slice(0, CACHEABLE_RECENT_TRADES_LIMIT);

    this.recentTradesCache.set(symbol, trades);
  }

  private parseRequestedSymbols(rawSymbols?: string) {
    const parsed = (rawSymbols ?? "")
      .split(",")
      .map((symbol) => this.normalizeSymbol(symbol))
      .filter((value): value is string => Boolean(value));

    return parsed.length > 0 ? parsed : [...DEFAULT_MARKET_SYMBOLS];
  }

  private normalizeSymbol(symbol: string) {
    const compact = String(symbol ?? "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");

    if (!compact || compact.length < 6 || compact.length > 20) {
      return "";
    }

    return compact;
  }

  private normalizeOrderBookDepth(depth: number) {
    if (!Number.isFinite(depth)) return 20;
    if (depth <= 10) return 10;
    if (depth <= 20) return 20;
    if (depth <= 50) return 50;
    if (depth <= 100) return 100;
    return 100;
  }

  private normalizeRecentTradeLimit(limit: number) {
    if (!Number.isFinite(limit)) return 40;
    if (limit <= 0) return 40;
    if (limit > 200) return 200;
    return Math.floor(limit);
  }

  private isSupportedSpotPair(symbol: string) {
    if (!symbol.endsWith("USDT")) return false;
    if (symbol.startsWith("USD")) return false;
    if (symbol.includes("UPUSDT") || symbol.includes("DOWNUSDT")) return false;
    if (symbol.includes("BULL") || symbol.includes("BEAR")) return false;
    return true;
  }

  private splitSymbol(symbol: string) {
    for (const quoteAsset of KNOWN_QUOTES) {
      if (symbol.endsWith(quoteAsset)) {
        return {
          baseAsset: symbol.slice(0, symbol.length - quoteAsset.length),
          quoteAsset,
        };
      }
    }

    return {
      baseAsset: symbol.slice(0, 3),
      quoteAsset: symbol.slice(3),
    };
  }

  private normalizeTicker(
    payload: Binance24HourTicker | { s: string; p: string; P: string; c: string; o: string; h: string; l: string; q: string; b: string; a: string; n: number; O: number; C: number; v: string },
    streaming: boolean,
  ): MarketTickerSnapshot {
    const symbol = "symbol" in payload ? payload.symbol : payload.s;
    const { baseAsset, quoteAsset } = this.splitSymbol(symbol);

    return {
      symbol,
      baseAsset,
      quoteAsset,
      displaySymbol: `${baseAsset}/${quoteAsset}`,
      lastPrice: "lastPrice" in payload ? payload.lastPrice : payload.c,
      openPrice: "openPrice" in payload ? payload.openPrice : payload.o,
      highPrice: "highPrice" in payload ? payload.highPrice : payload.h,
      lowPrice: "lowPrice" in payload ? payload.lowPrice : payload.l,
      priceChange: "priceChange" in payload ? payload.priceChange : payload.p,
      priceChangePercent: "priceChangePercent" in payload ? payload.priceChangePercent : payload.P,
      volume: "volume" in payload ? payload.volume : payload.v,
      quoteVolume: "quoteVolume" in payload ? payload.quoteVolume : payload.q,
      bidPrice: "bidPrice" in payload ? payload.bidPrice : payload.b,
      askPrice: "askPrice" in payload ? payload.askPrice : payload.a,
      tradeCount: "count" in payload ? payload.count : payload.n,
      openTime: "openTime" in payload ? payload.openTime : payload.O,
      closeTime: "closeTime" in payload ? payload.closeTime : payload.C,
      updatedAt: Date.now(),
      source: "binance",
      streaming,
    };
  }

  private normalizeCandle(payload: BinanceKlinePayload, _streaming: boolean): MarketCandle {
    return {
      symbol: payload.s,
      interval: payload.i,
      openTime: payload.t,
      closeTime: payload.T,
      open: payload.o,
      high: payload.h,
      low: payload.l,
      close: payload.c,
      volume: payload.v,
      quoteVolume: payload.q,
      tradeCount: payload.n,
      isClosed: payload.x,
      updatedAt: Date.now(),
    };
  }

  private normalizeOrderBook(
    symbol: string,
    bids: [string, string][],
    asks: [string, string][],
    streaming: boolean,
    _lastUpdateId?: number,
  ): MarketOrderBookSnapshot {
    const normalizedBids = this.normalizeBookLevels("BID", bids);
    const normalizedAsks = this.normalizeBookLevels("ASK", asks);

    const bestBid = normalizedBids[0]?.price ?? null;
    const bestAsk = normalizedAsks[0]?.price ?? null;
    const spread =
      bestBid && bestAsk
        ? this.formatScaledValue(this.parseScaledDecimal(bestAsk) - this.parseScaledDecimal(bestBid))
        : null;

    return {
      symbol,
      bids: normalizedBids,
      asks: normalizedAsks,
      bestBid,
      bestAsk,
      spread,
      updatedAt: Date.now(),
      source: "binance",
      streaming,
    };
  }

  private normalizeBookLevels(side: "BID" | "ASK", source: [string, string][]) {
    const levels: MarketOrderBookLevel[] = [];
    let cumulative = 0n;

    for (const [priceRaw, quantityRaw] of source.slice(0, DEFAULT_ORDER_BOOK_DEPTH)) {
      const price = this.normalizeDecimalString(priceRaw);
      const quantity = this.normalizeDecimalString(quantityRaw);
      if (!price || !quantity) {
        continue;
      }

      const quantityScaled = this.parseScaledDecimal(quantity);
      if (quantityScaled <= 0n) {
        continue;
      }

      cumulative += quantityScaled;
      levels.push({
        price,
        quantity,
        cumulativeQuantity: this.formatScaledValue(cumulative),
        side,
      });
    }

    return levels;
  }

  private normalizeRecentTrade(
    symbol: string,
    tradeId: number,
    priceRaw: string,
    quantityRaw: string,
    quoteQuantityRaw: string,
    tradedAt: number,
    side: "BUY" | "SELL",
  ): MarketRecentTrade {
    return {
      symbol,
      tradeId: String(tradeId),
      price: this.normalizeDecimalString(priceRaw),
      quantity: this.normalizeDecimalString(quantityRaw),
      quoteQuantity: this.normalizeDecimalString(quoteQuantityRaw),
      tradedAt,
      side,
      updatedAt: Date.now(),
    };
  }

  private buildStreamNames() {
    const tickerStreams = [...this.trackedTickerSymbols].map((symbol) => `${symbol.toLowerCase()}@ticker`);
    const candleStreams = [...this.trackedCandleStreams]
      .map((entry) => {
        const [symbol = "", interval = ""] = entry.split(":");
        if (!symbol || !interval) return "";
        return `${symbol.toLowerCase()}@kline_${interval}`;
      })
      .filter(Boolean);
    const orderBookStreams = [...this.trackedOrderBookSymbols].map(
      (symbol) => `${symbol.toLowerCase()}@depth20@100ms`,
    );
    const tradeStreams = [...this.trackedRecentTradesSymbols].map((symbol) => `${symbol.toLowerCase()}@trade`);

    return [...new Set([...tickerStreams, ...candleStreams, ...orderBookStreams, ...tradeStreams])];
  }

  private openStream() {
    const streamNames = this.buildStreamNames();
    if (streamNames.length === 0) return;

    const socket = new WebSocket(`${BINANCE_STREAM_BASE_URL}${streamNames.join("/")}`);
    this.ws = socket;

    socket.on("open", () => {
      this.streamingAvailable = true;
      this.logger.log(`Connected market stream with ${streamNames.length} subscriptions.`);
    });

    socket.on("message", (data) => {
      this.handleStreamMessage(data.toString());
    });

    socket.on("error", () => {
      if (this.ws === socket) {
        this.streamingAvailable = false;
      }
    });

    socket.on("close", () => {
      if (this.ws === socket) {
        this.ws = null;
        this.streamingAvailable = false;
        this.scheduleReconnect(2_000);
      }
    });
  }

  private closeStream() {
    const socket = this.ws;
    this.ws = null;
    this.streamingAvailable = false;

    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
      socket.close(1000, "refresh");
    }
  }

  private scheduleReconnect(delayMs: number) {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.closeStream();
      this.openStream();
    }, delayMs);
  }

  private handleStreamMessage(rawMessage: string) {
    try {
      const payload = JSON.parse(rawMessage) as {
        stream?: string;
        data?: Record<string, unknown>;
      };

      if (!payload.data || typeof payload.stream !== "string") {
        return;
      }

      if (payload.stream.includes("@ticker")) {
        const ticker = this.normalizeTicker(
          payload.data as {
            s: string;
            p: string;
            P: string;
            c: string;
            o: string;
            h: string;
            l: string;
            q: string;
            b: string;
            a: string;
            n: number;
            O: number;
            C: number;
            v: string;
          },
          true,
        );

        this.tickerCache.set(ticker.symbol, ticker);
        this.gateway?.emitTicker(ticker, ticker.symbol);
        this.emitTickerToListeners(ticker);
        return;
      }

      if (payload.stream.includes("@kline_")) {
        const kline = (payload.data as { k?: BinanceKlinePayload }).k;
        if (!kline) return;

        const candle = this.normalizeCandle(kline, true);
        const cacheKey = `${candle.symbol}:${candle.interval}`;
        const next = [...(this.candleCache.get(cacheKey) ?? [])];
        const existingIndex = next.findIndex((entry) => entry.openTime === candle.openTime);

        if (existingIndex >= 0) {
          next[existingIndex] = candle;
        } else {
          next.push(candle);
        }

        this.candleCache.set(cacheKey, next.slice(-CACHEABLE_CANDLE_LIMIT));
        this.gateway?.emitCandle(candle, candle.symbol, candle.interval);
        return;
      }

      if (payload.stream.includes("@depth20@100ms")) {
        const symbolFromStream = this.extractSymbolFromStream(payload.stream);
        const depthPayload = payload.data as BinanceDepthStreamPayload;
        const symbol = this.normalizeSymbol(depthPayload.s ?? symbolFromStream);
        const bids = depthPayload.bids ?? [];
        const asks = depthPayload.asks ?? [];

        if (!symbol || bids.length === 0 || asks.length === 0) {
          return;
        }

        const snapshot = this.normalizeOrderBook(
          symbol,
          bids,
          asks,
          true,
          depthPayload.lastUpdateId,
        );
        this.orderBookCache.set(symbol, snapshot);
        this.gateway?.emitOrderBook(snapshot, symbol);
        this.emitOrderBookToListeners(snapshot);
        return;
      }

      if (payload.stream.includes("@trade")) {
        const symbolFromStream = this.extractSymbolFromStream(payload.stream);
        const tradePayload = payload.data as BinanceStreamTradePayload;
        const symbol = this.normalizeSymbol(tradePayload.s ?? symbolFromStream);
        if (!symbol || typeof tradePayload.t !== "number" || !tradePayload.p || !tradePayload.q) {
          return;
        }

        const trade = this.normalizeRecentTrade(
          symbol,
          tradePayload.t,
          tradePayload.p,
          tradePayload.q,
          this.multiplyDecimalStrings(tradePayload.p, tradePayload.q),
          typeof tradePayload.T === "number" ? tradePayload.T : Date.now(),
          tradePayload.m ? "SELL" : "BUY",
        );

        const current = this.recentTradesCache.get(symbol) ?? [];
        const next = [trade, ...current.filter((entry) => entry.tradeId !== trade.tradeId)].slice(
          0,
          CACHEABLE_RECENT_TRADES_LIMIT,
        );
        this.recentTradesCache.set(symbol, next);
        this.gateway?.emitRecentTrade(trade, symbol);
      }
    } catch (error) {
      this.logger.debug(
        `Ignored market stream payload: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
  }

  private emitTickerToListeners(ticker: MarketTickerSnapshot) {
    this.tickerListeners.forEach((listener) => {
      Promise.resolve(listener(ticker)).catch((error) => {
        this.logger.debug(
          `Ticker listener failed for ${ticker.symbol}: ${error instanceof Error ? error.message : "unknown error"}`,
        );
      });
    });
  }

  private emitOrderBookToListeners(orderBook: MarketOrderBookSnapshot) {
    this.orderBookListeners.forEach((listener) => {
      Promise.resolve(listener(orderBook)).catch((error) => {
        this.logger.debug(
          `Order book listener failed for ${orderBook.symbol}: ${error instanceof Error ? error.message : "unknown error"}`,
        );
      });
    });
  }

  private extractSymbolFromStream(streamName: string) {
    const [symbol = ""] = streamName.split("@");
    return symbol.toUpperCase();
  }

  private normalizeDecimalString(value: string) {
    const normalized = String(value ?? "").trim();
    if (!/^\d+(\.\d+)?$/.test(normalized)) {
      return "";
    }
    const compact = normalized.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
    return compact.replace(/^0+(?=\d)/, "") || "0";
  }

  private parseScaledDecimal(value: string) {
    const normalized = this.normalizeDecimalString(value);
    if (!normalized) {
      return 0n;
    }

    const [wholePart = "0", fractionalPart = ""] = normalized.split(".");
    const paddedFraction = `${fractionalPart}${"0".repeat(8)}`.slice(0, 8);
    return BigInt(wholePart) * SCALE_8 + BigInt(paddedFraction || "0");
  }

  private formatScaledValue(value: bigint) {
    const negative = value < 0n;
    const absolute = negative ? value * -1n : value;
    const whole = absolute / SCALE_8;
    const fraction = (absolute % SCALE_8).toString().padStart(8, "0").replace(/0+$/, "");
    const sign = negative ? "-" : "";
    return fraction ? `${sign}${whole.toString()}.${fraction}` : `${sign}${whole.toString()}`;
  }

  private multiplyDecimalStrings(left: string, right: string) {
    const leftScaled = this.parseScaledDecimal(left);
    const rightScaled = this.parseScaledDecimal(right);
    const resultScaled = (leftScaled * rightScaled) / SCALE_8;
    return this.formatScaledValue(resultScaled);
  }
}
