import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const BINANCE_REST_BASE_URL = "https://api.binance.com";
const DEFAULT_SYMBOL = "BTCUSDT";
const DEFAULT_LIMIT = 20;
const ALLOWED_LIMITS = [5, 10, 20, 50, 100, 500, 1000] as const;
const SYNTHETIC_MID_PRICE_BY_SYMBOL: Record<string, number> = {
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

type NumericOrderBookLevel = {
  price: number;
  quantity: number;
  total: number;
};

type OverviewPair = {
  symbol?: string;
  lastPrice?: string;
  price?: number;
};

type OverviewPayload = {
  pairs?: OverviewPair[];
  overview?: OverviewPair[];
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

function parseSymbol(input: string | null) {
  if (!input || input.trim().length === 0) {
    return {
      symbol: DEFAULT_SYMBOL,
      isValid: true,
    } as const;
  }

  const symbol = input.trim().toUpperCase();
  const isValid = /^[A-Z0-9]{6,20}$/.test(symbol);

  return {
    symbol,
    isValid,
  } as const;
}

function normalizeLimit(rawLimit: string | null) {
  if (!rawLimit || rawLimit.trim().length === 0) {
    return DEFAULT_LIMIT;
  }

  if (!/^\d+$/.test(rawLimit.trim())) {
    return DEFAULT_LIMIT;
  }

  const parsed = Number.parseInt(rawLimit, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_LIMIT;
  }

  if (ALLOWED_LIMITS.includes(parsed as (typeof ALLOWED_LIMITS)[number])) {
    return parsed;
  }

  return DEFAULT_LIMIT;
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

function normalizeNumericDepthLevels(levels: [string, string][]) {
  return levels
    .map(([priceRaw, qtyRaw]) => {
      const price = Number.parseFloat(priceRaw);
      const quantity = Number.parseFloat(qtyRaw);
      if (!Number.isFinite(price) || !Number.isFinite(quantity) || price <= 0 || quantity <= 0) {
        return null;
      }

      return {
        price,
        quantity,
        total: Number((price * quantity).toFixed(8)),
      } satisfies NumericOrderBookLevel;
    })
    .filter((level): level is NumericOrderBookLevel => Boolean(level));
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

async function resolveFallbackMidPrice(request: NextRequest, symbol: string) {
  const fallbackUrl = new URL("/api/markets/overview", request.nextUrl.origin);
  fallbackUrl.searchParams.set("symbols", symbol);

  const response = await fetch(fallbackUrl.toString(), {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Overview fallback request failed (${response.status}).`);
  }

  const payload = (await response.json()) as OverviewPayload;
  const rows = [
    ...(Array.isArray(payload.pairs) ? payload.pairs : []),
    ...(Array.isArray(payload.overview) ? payload.overview : []),
  ];

  const match = rows.find((row) => String(row.symbol ?? "").toUpperCase() === symbol);
  const priceRaw = match?.lastPrice ?? (typeof match?.price === "number" ? String(match.price) : "");
  const price = Number.parseFloat(priceRaw);
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error("Fallback overview did not provide a valid price.");
  }

  return price;
}

function buildSyntheticDepth(midPrice: number, limit: number) {
  const boundedLimit = Math.min(Math.max(limit, 5), 100);
  const baseSpread = Math.max(midPrice * 0.0002, 0.0000001);
  const bestBid = midPrice - baseSpread;
  const bestAsk = midPrice + baseSpread;
  const step = Math.max(midPrice * 0.00025, 0.0000001);

  const numericBids: NumericOrderBookLevel[] = [];
  const numericAsks: NumericOrderBookLevel[] = [];
  const bidRows: [string, string][] = [];
  const askRows: [string, string][] = [];

  for (let index = 0; index < boundedLimit; index += 1) {
    const qty = Number((0.15 + (boundedLimit - index) * 0.02).toFixed(8));
    const bidPrice = Number((bestBid - index * step).toFixed(8));
    const askPrice = Number((bestAsk + index * step).toFixed(8));

    numericBids.push({
      price: bidPrice,
      quantity: qty,
      total: Number((bidPrice * qty).toFixed(8)),
    });
    numericAsks.push({
      price: askPrice,
      quantity: qty,
      total: Number((askPrice * qty).toFixed(8)),
    });

    bidRows.push([toFixedString(bidPrice), toFixedString(qty)]);
    askRows.push([toFixedString(askPrice), toFixedString(qty)]);
  }

  return {
    numericBids,
    numericAsks,
    bidRows,
    askRows,
  };
}

function resolveSyntheticMidPrice(symbol: string) {
  return SYNTHETIC_MID_PRICE_BY_SYMBOL[symbol] ?? 1000;
}

export async function GET(request: NextRequest) {
  const symbolCandidate = parseSymbol(request.nextUrl.searchParams.get("symbol"));
  const symbol = symbolCandidate.symbol;
  const normalizedLimit = normalizeLimit(request.nextUrl.searchParams.get("limit"));

  if (!symbolCandidate.isValid) {
    return errorResponse(
      400,
      "Invalid symbol query parameter.",
      "symbol is required and must look like BTCUSDT.",
    );
  }

  let upstreamFailureReason = "";

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

    const numericBids = normalizeNumericDepthLevels(payload.bids);
    const numericAsks = normalizeNumericDepthLevels(payload.asks);
    const bestBidValue = numericBids[0]?.price ?? null;
    const bestAskValue = numericAsks[0]?.price ?? null;
    const spreadValue =
      bestBidValue !== null && bestAskValue !== null
        ? Number((bestAskValue - bestBidValue).toFixed(8))
        : null;

    const bids = normalizeDepthLevels(payload.bids, "BID");
    const asks = normalizeDepthLevels(payload.asks, "ASK");
    const bestBid = bids[0]?.price ?? null;
    const bestAsk = asks[0]?.price ?? null;
    const spread = computeSpread(bestBid, bestAsk);
    const updatedAt = Date.now();

    return NextResponse.json(
      {
        symbol,
        lastUpdateId: payload.lastUpdateId ?? null,
        bids: numericBids,
        asks: numericAsks,
        bestBid: bestBidValue,
        bestAsk: bestAskValue,
        spread: spreadValue,
        source: "binance",
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
    upstreamFailureReason = error instanceof Error ? error.message : "Unknown order book route error.";
  }

  try {
    const midPrice = await resolveFallbackMidPrice(request, symbol);
    const synthetic = buildSyntheticDepth(midPrice, normalizedLimit);
    const bids = normalizeDepthLevels(synthetic.bidRows, "BID");
    const asks = normalizeDepthLevels(synthetic.askRows, "ASK");
    const bestBid = bids[0]?.price ?? null;
    const bestAsk = asks[0]?.price ?? null;
    const spread = computeSpread(bestBid, bestAsk);
    const bestBidValue = synthetic.numericBids[0]?.price ?? null;
    const bestAskValue = synthetic.numericAsks[0]?.price ?? null;
    const spreadValue =
      bestBidValue !== null && bestAskValue !== null
        ? Number((bestAskValue - bestBidValue).toFixed(8))
        : null;
    const updatedAt = Date.now();

    return NextResponse.json(
      {
        symbol,
        lastUpdateId: null,
        bids: synthetic.numericBids,
        asks: synthetic.numericAsks,
        bestBid: bestBidValue,
        bestAsk: bestAskValue,
        spread: spreadValue,
        source: "synthetic-fallback",
        fallback: true,
        details: "Live depth feed temporarily unavailable. Showing synthetic depth based on latest market price.",
        orderBook: {
          symbol,
          bids,
          asks,
          bestBid,
          bestAsk,
          spread,
          updatedAt,
          source: "synthetic-fallback",
          streaming: false,
          lastUpdateId: null,
        },
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
  } catch (fallbackError) {
    const fallbackDetails = fallbackError instanceof Error ? fallbackError.message : "Unknown fallback error.";
    const synthetic = buildSyntheticDepth(resolveSyntheticMidPrice(symbol), normalizedLimit);
    const bids = normalizeDepthLevels(synthetic.bidRows, "BID");
    const asks = normalizeDepthLevels(synthetic.askRows, "ASK");
    const bestBid = bids[0]?.price ?? null;
    const bestAsk = asks[0]?.price ?? null;
    const spread = computeSpread(bestBid, bestAsk);
    const bestBidValue = synthetic.numericBids[0]?.price ?? null;
    const bestAskValue = synthetic.numericAsks[0]?.price ?? null;
    const spreadValue =
      bestBidValue !== null && bestAskValue !== null
        ? Number((bestAskValue - bestBidValue).toFixed(8))
        : null;
    const updatedAt = Date.now();

    return NextResponse.json(
      {
        symbol,
        lastUpdateId: null,
        bids: synthetic.numericBids,
        asks: synthetic.numericAsks,
        bestBid: bestBidValue,
        bestAsk: bestAskValue,
        spread: spreadValue,
        source: "synthetic-fallback",
        fallback: true,
        details: `Primary source failed: ${upstreamFailureReason}. Secondary fallback failed: ${fallbackDetails}. Serving synthetic depth.`,
        orderBook: {
          symbol,
          bids,
          asks,
          bestBid,
          bestAsk,
          spread,
          updatedAt,
          source: "synthetic-fallback",
          streaming: false,
          lastUpdateId: null,
        },
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
  }
}
