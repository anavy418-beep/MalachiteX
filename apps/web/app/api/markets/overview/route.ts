import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const BINANCE_REST_BASE_URL = "https://api.binance.com";
const DEFAULT_SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "DOGEUSDT"];
const MAX_SYMBOLS = 50;
const KNOWN_QUOTES = ["USDT", "USDC", "BTC", "ETH", "BNB", "TRY", "EUR", "GBP"] as const;

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

type MarketTickerSnapshot = {
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

function buildErrorResponse(status: number, message: string, details: string) {
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

function splitSymbol(symbol: string) {
  const upper = symbol.toUpperCase();
  for (const quote of KNOWN_QUOTES) {
    if (upper.endsWith(quote) && upper.length > quote.length) {
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

function parseSymbols(rawSymbols: string | null) {
  if (!rawSymbols || rawSymbols.trim().length === 0) {
    return {
      symbols: DEFAULT_SYMBOLS,
      invalid: [] as string[],
    };
  }

  const values = rawSymbols
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter((value) => value.length > 0);
  const unique = [...new Set(values)].slice(0, MAX_SYMBOLS);
  const valid = unique.filter((value) => /^[A-Z0-9]{6,20}$/.test(value));
  const invalid = unique.filter((value) => !/^[A-Z0-9]{6,20}$/.test(value));

  return {
    symbols: valid.length > 0 ? valid : DEFAULT_SYMBOLS,
    invalid,
  };
}

function normalizeTicker(ticker: Binance24HourTicker): MarketTickerSnapshot {
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

function toSummaryRow(pair: MarketTickerSnapshot) {
  return {
    symbol: pair.symbol,
    price: Number(pair.lastPrice),
    change24h: Number(pair.priceChangePercent),
    high24h: Number(pair.highPrice),
    low24h: Number(pair.lowPrice),
    volume24h: Number(pair.quoteVolume),
  };
}

function buildFallbackOverview(symbols: string[]) {
  const now = Date.now();
  const pairs = symbols.map((symbol, index) => {
    const { baseAsset, quoteAsset } = splitSymbol(symbol);
    const price = (1000 + index * 37).toFixed(2);

    return {
      symbol,
      baseAsset,
      quoteAsset,
      displaySymbol: `${baseAsset}/${quoteAsset}`,
      lastPrice: price,
      openPrice: price,
      highPrice: price,
      lowPrice: price,
      priceChange: "0.00",
      priceChangePercent: "0.00",
      volume: "0.00",
      quoteVolume: "0.00",
      bidPrice: price,
      askPrice: price,
      tradeCount: 0,
      openTime: now - 86_400_000,
      closeTime: now,
      updatedAt: now,
      source: "binance",
      streaming: false,
    } satisfies MarketTickerSnapshot;
  });

  return {
    pairs,
    topGainers: pairs.slice(0, 5),
    topLosers: pairs.slice(-5),
    overview: pairs.map(toSummaryRow),
    source: "binance" as const,
    streaming: false,
    updatedAt: now,
    fallback: true,
  };
}

export async function GET(request: NextRequest) {
  const rawSymbols = request.nextUrl.searchParams.get("symbols");
  const { symbols, invalid } = parseSymbols(rawSymbols);

  if (rawSymbols && invalid.length > 0 && symbols.length === 0) {
    return buildErrorResponse(
      400,
      "Invalid symbols query parameter.",
      "Provide comma-separated symbols such as symbols=BTCUSDT,ETHUSDT.",
    );
  }

  try {
    const upstreamResponse = await fetch(
      `${BINANCE_REST_BASE_URL}/api/v3/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(symbols))}`,
      {
        cache: "no-store",
        headers: {
          Accept: "application/json",
        },
      },
    );

    if (!upstreamResponse.ok) {
      const details = await upstreamResponse.text();
      throw new Error(`Binance overview request failed (${upstreamResponse.status}): ${details.slice(0, 200)}`);
    }

    const payload = (await upstreamResponse.json()) as Binance24HourTicker[];
    if (!Array.isArray(payload)) {
      throw new Error("Unexpected Binance overview payload shape.");
    }

    const pairs = payload.map(normalizeTicker);
    const movers = [...pairs].sort(
      (left, right) => Number.parseFloat(right.priceChangePercent) - Number.parseFloat(left.priceChangePercent),
    );

    return NextResponse.json(
      {
        pairs,
        topGainers: movers.slice(0, 5),
        topLosers: [...movers].reverse().slice(0, 5),
        overview: pairs.map(toSummaryRow),
        source: "binance",
        streaming: false,
        updatedAt: Date.now(),
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      },
    );
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown market overview error.";
    const fallback = buildFallbackOverview(symbols);

    return NextResponse.json(
      {
        ...fallback,
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
