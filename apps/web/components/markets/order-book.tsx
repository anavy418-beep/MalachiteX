"use client";

import { useMemo } from "react";
import type { MarketOrderBookSnapshot } from "@/services/markets.service";

function formatPrice(value: string) {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return "-";

  if (parsed >= 1000) {
    return parsed.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  if (parsed >= 1) {
    return parsed.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  }

  return parsed.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 8 });
}

function formatSize(value: string) {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return "-";
  return parsed.toLocaleString(undefined, {
    minimumFractionDigits: parsed >= 1 ? 2 : 4,
    maximumFractionDigits: parsed >= 1 ? 4 : 8,
  });
}

function toNumber(value: string) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function OrderBook({
  symbol,
  orderBook,
  rows = 12,
}: {
  symbol: string;
  orderBook: MarketOrderBookSnapshot | null;
  rows?: number;
}) {
  const asks = orderBook?.asks.slice(0, rows).reverse() ?? [];
  const bids = orderBook?.bids.slice(0, rows) ?? [];
  const bestBid = orderBook?.bestBid ?? (bids[0]?.price ?? null);
  const bestAsk = orderBook?.bestAsk ?? (asks[asks.length - 1]?.price ?? null);
  const computedSpread = useMemo(() => {
    if (orderBook?.spread) {
      return orderBook.spread;
    }

    if (!bestBid || !bestAsk) {
      return null;
    }

    const bid = Number.parseFloat(bestBid);
    const ask = Number.parseFloat(bestAsk);
    if (!Number.isFinite(bid) || !Number.isFinite(ask) || ask < bid) {
      return null;
    }

    return (ask - bid).toFixed(8).replace(/0+$/, "").replace(/\.$/, "");
  }, [bestAsk, bestBid, orderBook?.spread]);

  const maxCumulative = useMemo(() => {
    const cumulativeValues = [...asks, ...bids].map((entry) => toNumber(entry.cumulativeQuantity));
    return cumulativeValues.length > 0 ? Math.max(...cumulativeValues) : 0;
  }, [asks, bids]);

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60">
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-slate-100">Order Book</p>
          <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">{symbol.replace("USDT", "/USDT")}</p>
        </div>
        <p className="text-[11px] text-slate-500">
          Spread {computedSpread ? formatPrice(computedSpread) : "-"}
        </p>
      </div>

      <div className="grid grid-cols-3 px-4 py-2 text-[11px] uppercase tracking-[0.16em] text-slate-500">
        <span>Price</span>
        <span className="text-right">Qty</span>
        <span className="text-right">Depth</span>
      </div>

      <div className="space-y-1 px-2 pb-2">
        {asks.length === 0 ? (
          <div className="px-2 py-8 text-center text-sm text-slate-500">Loading order book...</div>
        ) : (
          asks.map((level) => {
            const depthWidth =
              maxCumulative > 0
                ? Math.max(6, Math.min(100, (toNumber(level.cumulativeQuantity) / maxCumulative) * 100))
                : 0;
            const isBestAsk = orderBook?.bestAsk === level.price;
            return (
              <div key={`ask-${level.price}-${level.cumulativeQuantity}`} className="relative overflow-hidden rounded-lg px-2 py-1 text-xs">
                <div
                  className={`absolute right-0 top-0 h-full bg-red-500/10 ${isBestAsk ? "bg-red-500/20" : ""}`}
                  style={{ width: `${depthWidth}%` }}
                />
                <div className="relative grid grid-cols-3">
                  <span className={`${isBestAsk ? "font-semibold text-red-300" : "text-red-400"}`}>
                    {formatPrice(level.price)}
                  </span>
                  <span className="text-right text-slate-300">{formatSize(level.quantity)}</span>
                  <span className="text-right text-slate-400">{formatSize(level.cumulativeQuantity)}</span>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="mx-4 rounded-lg border border-zinc-800 bg-zinc-900/80 px-3 py-2 text-center text-sm">
        <span className="text-slate-400">Best Bid / Ask: </span>
        <span className="font-medium text-emerald-300">
          {bestBid ? formatPrice(bestBid) : "-"}
        </span>
        <span className="mx-1 text-slate-500">/</span>
        <span className="font-medium text-red-300">{bestAsk ? formatPrice(bestAsk) : "-"}</span>
        <span className="mx-2 text-slate-500">•</span>
        <span className="text-slate-400">Spread </span>
        <span className="font-medium text-slate-200">{computedSpread ? formatPrice(computedSpread) : "-"}</span>
      </div>

      <div className="space-y-1 px-2 py-2">
        {bids.length === 0 ? (
          <div className="px-2 py-8 text-center text-sm text-slate-500">Loading order book...</div>
        ) : (
          bids.map((level) => {
            const depthWidth =
              maxCumulative > 0
                ? Math.max(6, Math.min(100, (toNumber(level.cumulativeQuantity) / maxCumulative) * 100))
                : 0;
            const isBestBid = orderBook?.bestBid === level.price;
            return (
              <div key={`bid-${level.price}-${level.cumulativeQuantity}`} className="relative overflow-hidden rounded-lg px-2 py-1 text-xs">
                <div
                  className={`absolute right-0 top-0 h-full bg-emerald-500/10 ${isBestBid ? "bg-emerald-500/20" : ""}`}
                  style={{ width: `${depthWidth}%` }}
                />
                <div className="relative grid grid-cols-3">
                  <span className={`${isBestBid ? "font-semibold text-emerald-300" : "text-emerald-400"}`}>
                    {formatPrice(level.price)}
                  </span>
                  <span className="text-right text-slate-300">{formatSize(level.quantity)}</span>
                  <span className="text-right text-slate-400">{formatSize(level.cumulativeQuantity)}</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
