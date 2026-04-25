import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const BINANCE_REST_BASE_URL = "https://api.binance.com";
const DEFAULT_LIMIT = 16;
const MAX_LIMIT = 40;
const KNOWN_QUOTES = ["USDT", "USDC", "BTC", "ETH", "BNB", "TRY", "EUR", "GBP"] as const;
const POPULAR_SYMBOLS = [
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
const SYNTHETIC_BASE_PRICE_BY_SYMBOL: Record<string, number> = {
  BTCUSDT: 68420.1,
  ETHUSDT: 3520.45,
  SOLUSDT: 158.77,
  BNBUSDT: 612.35,
  XRPUSDT: 0.59,
  DOGEUSDT: 0.19,
  ADAUSDT: 0.47,
  AVAXUSDT: 36.25,
  LINKUSDT: 14.1,
  TONUSDT: 6.2,
  TRXUSDT: 0.12,
  LTCUSDT: 88.33,
  BCHUSDT: 494.22,
  SHIBUSDT: 0.000026,
  DOTUSDT: 7.15,
  NEARUSDT: 7.84,
  MATICUSDT: 0.92,
  FILUSDT: 5.65,
  ATOMUSDT: 8.64,
  HBARUSDT: 0.13,
};

type Binance24HourTicker = {
  symbol: string;
  priceChange: string;
  priceChangePercent: string;
  lastPrice: string;
  openPrice: string;
  highPrice: string;
  lowPrice: string;
  volume: string;
  quoteVolume: string;
  bidPrice: string;
  askPrice: string;
  count: number;
  openTime: number;
  closeTime: number;
};

type MarketPairSnapshot = {
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
};

function errorResponse(status: number, message: string, details: string) {
  return NextResponse.json(
    {
      message,
      details,
    },
    {
      status,
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    },
  );
}

function parseLimit(rawLimit: string | null) {
  if (!rawLimit || rawLimit.trim().length === 0) {
    return DEFAULT_LIMIT;
  }

  if (!/^\d+$/.test(rawLimit.trim())) {
    return null;
  }

  const parsed = Number.parseInt(rawLimit, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return Math.min(MAX_LIMIT, Math.max(1, parsed));
}

function splitSymbol(symbol: string) {
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

function normalizeTicker(ticker: Binance24HourTicker): MarketPairSnapshot {
  const symbol = ticker.symbol.toUpperCase();
  const { baseAsset, quoteAsset } = splitSymbol(symbol);

  return {
    symbol,
    baseAsset,
    quoteAsset,
    displaySymbol: `${baseAsset}/${quoteAsset}`,
    lastPrice: ticker.lastPrice,
    openPrice: ticker.openPrice,
    highPrice: ticker.highPrice,
    lowPrice: ticker.lowPrice,
    priceChange: ticker.priceChange,
    priceChangePercent: ticker.priceChangePercent,
    volume: ticker.volume,
    quoteVolume: ticker.quoteVolume,
    bidPrice: ticker.bidPrice,
    askPrice: ticker.askPrice,
    tradeCount: Number.isFinite(ticker.count) ? ticker.count : 0,
    openTime: ticker.openTime,
    closeTime: ticker.closeTime,
    updatedAt: Date.now(),
    source: "binance",
    streaming: false,
  };
}

function toDecimalString(value: number, maxDigits = 8) {
  if (!Number.isFinite(value)) return "0";
  return value.toFixed(maxDigits).replace(/0+$/, "").replace(/\.$/, "") || "0";
}

function buildFallbackPair(symbol: string, index: number): MarketPairSnapshot {
  const { baseAsset, quoteAsset } = splitSymbol(symbol);
  const now = Date.now();
  const baseline = SYNTHETIC_BASE_PRICE_BY_SYMBOL[symbol] ?? Math.max(1000 - index * 23, 1);
  const movementPercent = (index % 2 === 0 ? 1 : -1) * (0.18 + (index % 5) * 0.19);
  const movement = baseline * (movementPercent / 100);
  const lastPrice = baseline + movement;
  const highPrice = Math.max(lastPrice, baseline) * 1.005;
  const lowPrice = Math.min(lastPrice, baseline) * 0.995;
  const quoteVolume = (95_000_000 / (index + 1)) * (1 + Math.abs(movementPercent) / 3);

  return {
    symbol,
    baseAsset,
    quoteAsset,
    displaySymbol: `${baseAsset}/${quoteAsset}`,
    lastPrice: toDecimalString(lastPrice),
    openPrice: toDecimalString(baseline),
    highPrice: toDecimalString(highPrice),
    lowPrice: toDecimalString(lowPrice),
    priceChange: toDecimalString(movement),
    priceChangePercent: toDecimalString(movementPercent),
    volume: toDecimalString(quoteVolume / Math.max(lastPrice, 1)),
    quoteVolume: toDecimalString(quoteVolume),
    bidPrice: toDecimalString(lastPrice * 0.9995),
    askPrice: toDecimalString(lastPrice * 1.0005),
    tradeCount: 0,
    openTime: now - 86_400_000,
    closeTime: now,
    updatedAt: now,
    source: "binance",
    streaming: false,
  };
}

function applySearchAndLimit(pairs: MarketPairSnapshot[], search: string, limit: number) {
  const normalizedSearch = search.trim().toUpperCase().replace(/\s+/g, "");
  const filtered = normalizedSearch
    ? pairs.filter(
        (pair) =>
          pair.symbol.includes(normalizedSearch) ||
          pair.baseAsset.includes(normalizedSearch) ||
          pair.displaySymbol.replace("/", "").includes(normalizedSearch),
      )
    : pairs;

  return filtered.slice(0, limit);
}

async function loadPairsFromBinance() {
  const response = await fetch(
    `${BINANCE_REST_BASE_URL}/api/v3/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(POPULAR_SYMBOLS))}`,
    {
      cache: "no-store",
      headers: {
        Accept: "application/json",
      },
    },
  );

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Binance tickers request failed (${response.status}): ${details.slice(0, 200)}`);
  }

  const payload = (await response.json()) as Binance24HourTicker[];
  if (!Array.isArray(payload)) {
    throw new Error("Unexpected Binance pairs payload shape.");
  }

  return payload
    .map(normalizeTicker)
    .sort((left, right) => Number.parseFloat(right.quoteVolume) - Number.parseFloat(left.quoteVolume));
}

export async function GET(request: NextRequest) {
  const rawLimit = request.nextUrl.searchParams.get("limit");
  const search = request.nextUrl.searchParams.get("search") ?? "";
  const limit = parseLimit(rawLimit);

  if (limit === null) {
    return errorResponse(
      400,
      "Invalid limit query parameter.",
      "limit must be a positive integer (for example: /api/markets/pairs?limit=16).",
    );
  }

  try {
    const livePairs = await loadPairsFromBinance();

    return NextResponse.json(
      {
        pairs: applySearchAndLimit(livePairs, search, limit),
        updatedAt: Date.now(),
        source: "binance",
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      },
    );
  } catch (error) {
    const fallback = POPULAR_SYMBOLS.map((symbol, index) => buildFallbackPair(symbol, index));
    const details = error instanceof Error ? error.message : "Unknown market pairs upstream error.";

    return NextResponse.json(
      {
        pairs: applySearchAndLimit(fallback, search, limit),
        updatedAt: Date.now(),
        source: "binance",
        fallback: true,
        details,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      },
    );
  }
}
