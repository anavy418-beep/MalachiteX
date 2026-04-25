import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const BINANCE_REST_BASE_URL = "https://api.binance.com";
const COINGECKO_MARKETS_BASE_URL = "https://api.coingecko.com/api/v3/coins/markets";
const DEFAULT_SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "DOGEUSDT"];
const MAX_SYMBOLS = 50;
const KNOWN_QUOTES = ["USDT", "USDC", "BTC", "ETH", "BNB", "TRY", "EUR", "GBP"] as const;

const SYMBOL_TO_COINGECKO_ID: Record<string, string> = {
  BTCUSDT: "bitcoin",
  ETHUSDT: "ethereum",
  SOLUSDT: "solana",
  BNBUSDT: "binancecoin",
  XRPUSDT: "ripple",
  DOGEUSDT: "dogecoin",
  ADAUSDT: "cardano",
  AVAXUSDT: "avalanche-2",
  LINKUSDT: "chainlink",
  TONUSDT: "the-open-network",
  TRXUSDT: "tron",
  LTCUSDT: "litecoin",
  BCHUSDT: "bitcoin-cash",
  SHIBUSDT: "shiba-inu",
  DOTUSDT: "polkadot",
  NEARUSDT: "near",
};

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
  source: "binance" | "coingecko";
  streaming: boolean;
};

type CoinGeckoMarketsRow = {
  id: string;
  symbol: string;
  current_price: number;
  high_24h: number | null;
  low_24h: number | null;
  total_volume: number;
  market_cap: number;
  price_change_percentage_24h: number | null;
};

type CachedOverviewSnapshot = {
  pairs: MarketTickerSnapshot[];
  source: "binance" | "coingecko";
  updatedAt: number;
};

let cachedOverviewSnapshot: CachedOverviewSnapshot | null = null;

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

function buildOverviewPayload(input: {
  pairs: MarketTickerSnapshot[];
  source: "binance" | "coingecko";
  updatedAt?: number;
  fallback?: boolean;
  details?: string;
}) {
  const updatedAt = input.updatedAt ?? Date.now();
  const pairs = input.pairs.map((pair) => ({ ...pair, updatedAt }));
  const movers = [...pairs].sort(
    (left, right) => Number.parseFloat(right.priceChangePercent) - Number.parseFloat(left.priceChangePercent),
  );

  return {
    pairs,
    topGainers: movers.slice(0, 5),
    topLosers: [...movers].reverse().slice(0, 5),
    overview: pairs.map(toSummaryRow),
    source: input.source,
    streaming: false,
    updatedAt,
    fallback: input.fallback ?? false,
    details: input.details,
  };
}

function getCachedOverview() {
  if (!cachedOverviewSnapshot) return null;
  return cachedOverviewSnapshot;
}

function rememberOverviewSnapshot(pairs: MarketTickerSnapshot[], source: "binance" | "coingecko", updatedAt: number) {
  cachedOverviewSnapshot = { pairs, source, updatedAt };
}

function normalizeDecimal(value: number) {
  if (!Number.isFinite(value)) return "0";
  return value.toFixed(value >= 1 ? 2 : 6).replace(/0+$/, "").replace(/\.$/, "") || "0";
}

function buildSyntheticOverviewPairs(symbols: string[]) {
  const now = Date.now();

  return symbols.map((symbol, index) => {
    const { baseAsset, quoteAsset } = splitSymbol(symbol);
    const baseline = SYNTHETIC_BASE_PRICE_BY_SYMBOL[symbol] ?? Math.max(1000 - index * 23, 1);
    const movementPercent = (index % 2 === 0 ? 1 : -1) * (0.15 + (index % 5) * 0.17);
    const movement = baseline * (movementPercent / 100);
    const lastPrice = baseline + movement;
    const openPrice = baseline;
    const highPrice = Math.max(lastPrice, openPrice) * 1.006;
    const lowPrice = Math.min(lastPrice, openPrice) * 0.994;
    const quoteVolume = (120_000_000 / (index + 1)) * (1 + Math.abs(movementPercent) / 4);

    return {
      symbol,
      baseAsset,
      quoteAsset,
      displaySymbol: `${baseAsset}/${quoteAsset}`,
      lastPrice: normalizeDecimal(lastPrice),
      openPrice: normalizeDecimal(openPrice),
      highPrice: normalizeDecimal(highPrice),
      lowPrice: normalizeDecimal(lowPrice),
      priceChange: normalizeDecimal(movement),
      priceChangePercent: normalizeDecimal(movementPercent),
      volume: normalizeDecimal(quoteVolume / Math.max(lastPrice, 1)),
      quoteVolume: normalizeDecimal(quoteVolume),
      bidPrice: normalizeDecimal(lastPrice * 0.9995),
      askPrice: normalizeDecimal(lastPrice * 1.0005),
      tradeCount: 0,
      openTime: now - 86_400_000,
      closeTime: now,
      updatedAt: now,
      source: "binance" as const,
      streaming: false,
    } satisfies MarketTickerSnapshot;
  });
}

async function fetchCoinGeckoOverview(symbols: string[]) {
  const coinIds = symbols
    .map((symbol) => SYMBOL_TO_COINGECKO_ID[symbol])
    .filter((id): id is string => Boolean(id));

  if (coinIds.length === 0) {
    return [] as MarketTickerSnapshot[];
  }

  const url = new URL(COINGECKO_MARKETS_BASE_URL);
  url.searchParams.set("vs_currency", "usd");
  url.searchParams.set("ids", [...new Set(coinIds)].join(","));
  url.searchParams.set("order", "market_cap_desc");
  url.searchParams.set("per_page", String(Math.max(coinIds.length, 20)));
  url.searchParams.set("page", "1");
  url.searchParams.set("sparkline", "false");
  url.searchParams.set("price_change_percentage", "24h");

  const response = await fetch(url.toString(), {
    cache: "no-store",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`CoinGecko overview request failed (${response.status}): ${details.slice(0, 180)}`);
  }

  const payload = (await response.json()) as CoinGeckoMarketsRow[];
  if (!Array.isArray(payload)) {
    throw new Error("Unexpected CoinGecko overview payload shape.");
  }

  const byId = new Map(payload.map((entry) => [entry.id, entry]));
  const now = Date.now();

  return symbols.flatMap((symbol) => {
    const coinId = SYMBOL_TO_COINGECKO_ID[symbol];
    const coin = coinId ? byId.get(coinId) : undefined;
    if (!coin || !Number.isFinite(coin.current_price) || coin.current_price <= 0) {
      return [];
    }

    const { baseAsset, quoteAsset } = splitSymbol(symbol);
    const changePercent = Number.isFinite(coin.price_change_percentage_24h ?? NaN)
      ? Number(coin.price_change_percentage_24h)
      : 0;
    const priceChange = coin.current_price * (changePercent / 100);
    const high = Number.isFinite(coin.high_24h ?? NaN) ? Number(coin.high_24h) : coin.current_price;
    const low = Number.isFinite(coin.low_24h ?? NaN) ? Number(coin.low_24h) : coin.current_price;
    const volumeQuote = Number.isFinite(coin.total_volume) ? coin.total_volume : 0;

    return [{
      symbol,
      baseAsset,
      quoteAsset,
      displaySymbol: `${baseAsset}/${quoteAsset}`,
      lastPrice: normalizeDecimal(coin.current_price),
      openPrice: normalizeDecimal(coin.current_price - priceChange),
      highPrice: normalizeDecimal(high),
      lowPrice: normalizeDecimal(low),
      priceChange: normalizeDecimal(priceChange),
      priceChangePercent: normalizeDecimal(changePercent),
      volume: normalizeDecimal(volumeQuote / Math.max(coin.current_price, 1)),
      quoteVolume: normalizeDecimal(volumeQuote),
      bidPrice: normalizeDecimal(coin.current_price),
      askPrice: normalizeDecimal(coin.current_price),
      tradeCount: 0,
      openTime: now - 86_400_000,
      closeTime: now,
      updatedAt: now,
      source: "coingecko" as const,
      streaming: false,
    } satisfies MarketTickerSnapshot];
  });
}

export async function GET(request: NextRequest) {
  const rawSymbols = request.nextUrl.searchParams.get("symbols");
  const { symbols, invalid } = parseSymbols(rawSymbols);
  const requestUrl = `${request.nextUrl.pathname}${request.nextUrl.search}`;

  if (rawSymbols && invalid.length > 0 && symbols.length === 0) {
    return buildErrorResponse(
      400,
      "Invalid symbols query parameter.",
      "Provide comma-separated symbols such as symbols=BTCUSDT,ETHUSDT.",
    );
  }

  try {
    if (process.env.NODE_ENV !== "production") {
      console.info("[markets/overview] fetch start", { requestUrl, symbolsCount: symbols.length });
    }

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
    const updatedAt = Date.now();
    rememberOverviewSnapshot(pairs, "binance", updatedAt);

    if (process.env.NODE_ENV !== "production") {
      console.info("[markets/overview] binance success", {
        requestUrl,
        status: upstreamResponse.status,
        pairs: pairs.length,
      });
    }

    return NextResponse.json(
      buildOverviewPayload({
        pairs,
        source: "binance",
        updatedAt,
      }),
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      },
    );
  } catch (error) {
    const primaryError = error instanceof Error ? error.message : "Unknown market overview error.";

    if (process.env.NODE_ENV !== "production") {
      console.warn("[markets/overview] binance failed", { requestUrl, reason: primaryError });
    }

    try {
      const fallbackPairs = await fetchCoinGeckoOverview(symbols);
      if (fallbackPairs.length > 0) {
        const updatedAt = Date.now();
        rememberOverviewSnapshot(fallbackPairs, "coingecko", updatedAt);

        if (process.env.NODE_ENV !== "production") {
          console.info("[markets/overview] coingecko fallback success", {
            requestUrl,
            pairs: fallbackPairs.length,
          });
        }

        return NextResponse.json(
          buildOverviewPayload({
            pairs: fallbackPairs,
            source: "coingecko",
            updatedAt,
          }),
          {
            status: 200,
            headers: {
              "Cache-Control": "no-store, max-age=0",
            },
          },
        );
      }
    } catch (secondaryError) {
      const secondaryDetails =
        secondaryError instanceof Error ? secondaryError.message : "Unknown coingecko fallback error.";
      if (process.env.NODE_ENV !== "production") {
        console.warn("[markets/overview] coingecko failed", { requestUrl, reason: secondaryDetails });
      }
    }

    const cached = getCachedOverview();
    if (cached && cached.pairs.length > 0) {
      return NextResponse.json(
        buildOverviewPayload({
          pairs: cached.pairs,
          source: cached.source,
          updatedAt: cached.updatedAt,
          fallback: true,
          details: primaryError,
        }),
        {
          status: 200,
          headers: {
            "Cache-Control": "no-store, max-age=0",
          },
        },
      );
    }

    const syntheticPairs = buildSyntheticOverviewPairs(symbols);
    const updatedAt = Date.now();

    return NextResponse.json(
      buildOverviewPayload({
        pairs: syntheticPairs,
        source: "binance",
        updatedAt,
        fallback: true,
        details: `${primaryError} (serving synthetic snapshot while live feeds recover)`,
      }),
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      },
    );
  }
}
