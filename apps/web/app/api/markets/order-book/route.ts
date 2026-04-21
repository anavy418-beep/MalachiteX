import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const BINANCE_REST_BASE_URL = "https://api.binance.com";
const DEFAULT_LIMIT = 20;
const ALLOWED_LIMITS = [5, 10, 20, 50, 100, 500, 1000] as const;

type BinanceDepthPayload = {
  lastUpdateId: number;
  bids: [string, string][];
  asks: [string, string][];
};

type OrderBookLevel = {
  price: string;
  quantity: string;
  cumulativeQuantity: string;
  side: "BID" | "ASK";
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

function normalizeSymbol(input: string | null) {
  return String(input ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function normalizeLimit(rawLimit: string | null) {
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

  return (
    ALLOWED_LIMITS.find((allowed) => allowed >= parsed) ??
    ALLOWED_LIMITS[ALLOWED_LIMITS.length - 1]
  );
}

function toFixedString(value: number, maxDigits = 8) {
  return value.toFixed(maxDigits).replace(/0+$/, "").replace(/\.$/, "") || "0";
}

function normalizeDepthLevels(
  levels: [string, string][],
  side: "BID" | "ASK",
): OrderBookLevel[] {
  let cumulative = 0;

  return levels
    .map(([priceRaw, qtyRaw]) => {
      const price = Number.parseFloat(priceRaw);
      const quantity = Number.parseFloat(qtyRaw);
      if (!Number.isFinite(price) || !Number.isFinite(quantity) || price <= 0 || quantity <= 0) {
        return null;
      }

      cumulative += quantity;

      return {
        price: toFixedString(price),
        quantity: toFixedString(quantity),
        cumulativeQuantity: toFixedString(cumulative),
        side,
      } satisfies OrderBookLevel;
    })
    .filter((level): level is OrderBookLevel => Boolean(level));
}

function computeSpread(bestBid: string | null, bestAsk: string | null) {
  if (!bestBid || !bestAsk) return null;

  const bid = Number.parseFloat(bestBid);
  const ask = Number.parseFloat(bestAsk);
  if (!Number.isFinite(bid) || !Number.isFinite(ask) || ask < bid) {
    return null;
  }

  return toFixedString(ask - bid);
}

export async function GET(request: NextRequest) {
  const symbol = normalizeSymbol(request.nextUrl.searchParams.get("symbol"));
  const normalizedLimit = normalizeLimit(request.nextUrl.searchParams.get("limit"));

  if (!symbol || symbol.length < 6 || symbol.length > 20) {
    return errorResponse(
      400,
      "Invalid symbol query parameter.",
      "symbol is required and must look like BTCUSDT.",
    );
  }

  if (normalizedLimit === null) {
    return errorResponse(
      400,
      "Invalid limit query parameter.",
      "limit must be a positive integer (for example: limit=20).",
    );
  }

  try {
    const upstreamResponse = await fetch(
      `${BINANCE_REST_BASE_URL}/api/v3/depth?symbol=${symbol}&limit=${normalizedLimit}`,
      {
        cache: "no-store",
        headers: {
          Accept: "application/json",
        },
      },
    );

    if (!upstreamResponse.ok) {
      const details = await upstreamResponse.text();
      throw new Error(`Binance depth request failed (${upstreamResponse.status}): ${details.slice(0, 200)}`);
    }

    const payload = (await upstreamResponse.json()) as BinanceDepthPayload;
    if (!payload || !Array.isArray(payload.bids) || !Array.isArray(payload.asks)) {
      throw new Error("Unexpected Binance depth payload shape.");
    }

    const bids = normalizeDepthLevels(payload.bids, "BID");
    const asks = normalizeDepthLevels(payload.asks, "ASK");
    const bestBid = bids[0]?.price ?? null;
    const bestAsk = asks[0]?.price ?? null;
    const spread = computeSpread(bestBid, bestAsk);
    const updatedAt = Date.now();

    return NextResponse.json(
      {
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
          streaming: false,
          lastUpdateId: payload.lastUpdateId,
        },
        source: "binance",
        updatedAt,
        streaming: false,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      },
    );
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown order book route error.";
    return errorResponse(502, "Failed to load order book data.", details);
  }
}

