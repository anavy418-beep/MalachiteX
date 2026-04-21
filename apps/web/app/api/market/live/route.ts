import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const COINGECKO_MARKETS_ENDPOINT =
  "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&page=1&sparkline=false&price_change_percentage=24h";
const FALLBACK_ICON_PATH = "/icons/coin-fallback.png";
const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 600;

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

      if (!response.ok) {
        const responseText = await response.text();
        throw new Error(`CoinGecko responded ${response.status}: ${responseText.slice(0, 180)}`);
      }

      const payload = (await response.json()) as CoinGeckoMarketRow[];
      if (!Array.isArray(payload)) {
        throw new Error("CoinGecko payload is not an array.");
      }

      return payload;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Unknown CoinGecko fetch error.");
      if (attempt < MAX_ATTEMPTS) {
        const nextDelay = RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
        await delay(nextDelay);
      }
    }
  }

  throw lastError ?? new Error("CoinGecko fetch failed after retries.");
}

export async function GET() {
  try {
    const payload = await fetchCoinGeckoMarkets();
    const items = payload
      .map(normalizeMarketRow)
      .filter((coin) => Number.isFinite(coin.price) && coin.price > 0);

    return NextResponse.json(
      {
        items,
        fetchedAt: new Date().toISOString(),
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      },
    );
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown live market route error.";

    return NextResponse.json(
      {
        error: "Failed to fetch live market data.",
        details,
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
