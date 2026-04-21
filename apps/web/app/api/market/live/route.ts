import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const COINGECKO_MARKETS_ENDPOINT =
  "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&page=1&sparkline=false&price_change_percentage=24h";
const FALLBACK_ICON_PATH = "/icons/coin-fallback.png";
const MAX_ATTEMPTS = 2;
const RETRY_BASE_DELAY_MS = 1_000;
const CACHE_TTL_MS = 45_000;
const RATE_LIMIT_BASE_BACKOFF_MS = 30_000;
const RATE_LIMIT_MAX_BACKOFF_MS = 5 * 60_000;

type CoinGeckoMarketRow = {
  id: string;
  symbol: string;
  name: string;
  image: string;
  current_price: number;
  market_cap: number;
  total_volume: number;
  price_change_percentage_24h: number | null;
  price_change_percentage_24h_in_currency?: number | null;
};

type NormalizedMarketRow = {
  id: string;
  name: string;
  symbol: string;
  icon: string;
  price: number;
  change24h: number;
  marketCap: number;
  volume24h: number;
  trend: number[];
};

type CachedSnapshot = {
  items: NormalizedMarketRow[];
  fetchedAtMs: number;
  lastUpdated: string;
};

type LiveMarketPayload = {
  items: NormalizedMarketRow[];
  isLive: boolean;
  isStale: boolean;
  source: "coingecko" | "cache";
  lastUpdated: string;
  message?: string;
  nextRefreshInMs: number;
};

class RateLimitedError extends Error {
  readonly retryAfterMs: number;

  constructor(retryAfterMs: number) {
    super("CoinGecko rate limit reached.");
    this.name = "RateLimitedError";
    this.retryAfterMs = retryAfterMs;
  }
}

let cachedSnapshot: CachedSnapshot | null = null;
let inFlightRefresh: Promise<CachedSnapshot> | null = null;
let rateLimitUntilMs = 0;
let rateLimitStrikeCount = 0;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeMarketRow(coin: CoinGeckoMarketRow): NormalizedMarketRow {
  const change24h =
    coin.price_change_percentage_24h_in_currency ??
    coin.price_change_percentage_24h ??
    0;
  const safePrice = Number.isFinite(coin.current_price) ? coin.current_price : 0;
  const baseline = safePrice !== 0 && Number.isFinite(change24h) ? safePrice / (1 + change24h / 100) : safePrice;

  return {
    id: coin.id,
    name: coin.name,
    symbol: coin.symbol.toUpperCase(),
    icon: typeof coin.image === "string" && coin.image.length > 0 ? coin.image : FALLBACK_ICON_PATH,
    price: safePrice,
    change24h: Number.isFinite(change24h) ? change24h : 0,
    marketCap: Number.isFinite(coin.market_cap) ? coin.market_cap : 0,
    volume24h: Number.isFinite(coin.total_volume) ? coin.total_volume : 0,
    trend: [baseline, safePrice],
  };
}

function parseRetryAfterHeaderMs(retryAfterHeader: string | null) {
  if (!retryAfterHeader) return 0;

  const seconds = Number.parseInt(retryAfterHeader, 10);
  if (Number.isFinite(seconds) && seconds > 0) {
    return seconds * 1_000;
  }

  const parsedDate = Date.parse(retryAfterHeader);
  if (Number.isFinite(parsedDate)) {
    return Math.max(0, parsedDate - Date.now());
  }

  return 0;
}

function computeBackoffMs(retryAfterMs = 0) {
  const exponential = RATE_LIMIT_BASE_BACKOFF_MS * 2 ** Math.min(Math.max(rateLimitStrikeCount - 1, 0), 4);
  return Math.min(RATE_LIMIT_MAX_BACKOFF_MS, Math.max(retryAfterMs, exponential));
}

function buildPayload(
  snapshot: CachedSnapshot,
  input: {
    isLive: boolean;
    isStale: boolean;
    source: "coingecko" | "cache";
    message?: string;
    nextRefreshInMs: number;
  },
): LiveMarketPayload {
  return {
    items: snapshot.items,
    isLive: input.isLive,
    isStale: input.isStale,
    source: input.source,
    lastUpdated: snapshot.lastUpdated,
    message: input.message,
    nextRefreshInMs: input.nextRefreshInMs,
  };
}

async function fetchCoinGeckoMarkets() {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(COINGECKO_MARKETS_ENDPOINT, {
        cache: "no-store",
        headers: {
          Accept: "application/json",
        },
      });

      if (response.status === 429) {
        const retryAfterMs = parseRetryAfterHeaderMs(response.headers.get("retry-after"));
        throw new RateLimitedError(retryAfterMs);
      }

      if (!response.ok) {
        throw new Error(`CoinGecko responded ${response.status}.`);
      }

      const payload = (await response.json()) as CoinGeckoMarketRow[];
      if (!Array.isArray(payload)) {
        throw new Error("CoinGecko payload is not an array.");
      }

      return payload;
    } catch (error) {
      if (error instanceof RateLimitedError) {
        throw error;
      }

      lastError = error instanceof Error ? error : new Error("Unknown CoinGecko fetch error.");
      if (attempt < MAX_ATTEMPTS) {
        const nextDelay = RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
        await delay(nextDelay);
      }
    }
  }

  throw lastError ?? new Error("CoinGecko fetch failed after retries.");
}

async function refreshSnapshot(nowMs: number) {
  const payload = await fetchCoinGeckoMarkets();
  const items = payload
    .map(normalizeMarketRow)
    .filter((coin) => Number.isFinite(coin.price) && coin.price > 0);

  if (items.length === 0) {
    throw new Error("CoinGecko returned no market rows.");
  }

  const snapshot: CachedSnapshot = {
    items,
    fetchedAtMs: nowMs,
    lastUpdated: new Date(nowMs).toISOString(),
  };

  cachedSnapshot = snapshot;
  rateLimitUntilMs = 0;
  rateLimitStrikeCount = 0;
  return snapshot;
}

function jsonResponse(payload: LiveMarketPayload, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}

export async function GET() {
  const nowMs = Date.now();
  const freshCacheExists = Boolean(cachedSnapshot) && nowMs - (cachedSnapshot?.fetchedAtMs ?? 0) < CACHE_TTL_MS;

  if (freshCacheExists && cachedSnapshot) {
    const nextRefreshInMs = Math.max(3_000, CACHE_TTL_MS - (nowMs - cachedSnapshot.fetchedAtMs));
    return jsonResponse(
      buildPayload(cachedSnapshot, {
        isLive: true,
        isStale: false,
        source: "cache",
        nextRefreshInMs,
      }),
    );
  }

  if (rateLimitUntilMs > nowMs) {
    const retryInMs = Math.max(3_000, rateLimitUntilMs - nowMs);

    if (cachedSnapshot) {
      return jsonResponse(
        buildPayload(cachedSnapshot, {
          isLive: false,
          isStale: true,
          source: "cache",
          message: "Live market temporarily limited. Showing recent market snapshot.",
          nextRefreshInMs: retryInMs,
        }),
      );
    }

    return NextResponse.json(
      {
        error: "Live market temporarily limited. Please retry shortly.",
        retryAfterMs: retryInMs,
      },
      {
        status: 429,
        headers: {
          "Cache-Control": "no-store, max-age=0",
          "Retry-After": String(Math.ceil(retryInMs / 1_000)),
        },
      },
    );
  }

  try {
    if (!inFlightRefresh) {
      inFlightRefresh = refreshSnapshot(nowMs).finally(() => {
        inFlightRefresh = null;
      });
    }

    const snapshot = await inFlightRefresh;

    return jsonResponse(
      buildPayload(snapshot, {
        isLive: true,
        isStale: false,
        source: "coingecko",
        nextRefreshInMs: CACHE_TTL_MS,
      }),
    );
  } catch (error) {
    if (error instanceof RateLimitedError) {
      rateLimitStrikeCount += 1;
      const backoffMs = computeBackoffMs(error.retryAfterMs);
      rateLimitUntilMs = Date.now() + backoffMs;

      console.warn(
        `[market/live] CoinGecko rate-limited. Backoff ${Math.ceil(backoffMs / 1_000)}s (strike ${rateLimitStrikeCount}).`,
      );

      if (cachedSnapshot) {
        return jsonResponse(
          buildPayload(cachedSnapshot, {
            isLive: false,
            isStale: true,
            source: "cache",
            message: "Live market temporarily limited. Showing recent market snapshot.",
            nextRefreshInMs: backoffMs,
          }),
        );
      }

      return NextResponse.json(
        {
          error: "Live market temporarily limited. Please retry shortly.",
          retryAfterMs: backoffMs,
        },
        {
          status: 429,
          headers: {
            "Cache-Control": "no-store, max-age=0",
            "Retry-After": String(Math.ceil(backoffMs / 1_000)),
          },
        },
      );
    }

    console.error("[market/live] Upstream market fetch failed:", error);

    if (cachedSnapshot) {
      return jsonResponse(
        buildPayload(cachedSnapshot, {
          isLive: false,
          isStale: true,
          source: "cache",
          message: "Using recent cached market data. Live refresh will resume automatically.",
          nextRefreshInMs: RATE_LIMIT_BASE_BACKOFF_MS,
        }),
      );
    }

    return NextResponse.json(
      {
        error: "Live market temporarily unavailable.",
      },
      {
        status: 502,
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      },
    );
  }
}
