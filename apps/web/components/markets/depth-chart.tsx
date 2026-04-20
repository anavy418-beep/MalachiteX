"use client";

import { useMemo } from "react";
import type { MarketOrderBookSnapshot } from "@/services/markets.service";

function toNumber(value: string) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDepth(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "-";
  return value.toLocaleString(undefined, {
    minimumFractionDigits: value >= 1 ? 2 : 4,
    maximumFractionDigits: value >= 1 ? 2 : 6,
  });
}

export function DepthChart({
  orderBook,
  symbol,
}: {
  orderBook: MarketOrderBookSnapshot | null;
  symbol: string;
}) {
  const points = useMemo(() => {
    const asks = (orderBook?.asks ?? []).slice(0, 20).reverse();
    const bids = (orderBook?.bids ?? []).slice(0, 20);
    const maxAskDepth = asks.reduce(
      (max, level) => Math.max(max, toNumber(level.cumulativeQuantity)),
      0,
    );
    const maxBidDepth = bids.reduce(
      (max, level) => Math.max(max, toNumber(level.cumulativeQuantity)),
      0,
    );
    const maxDepth = Math.max(maxAskDepth, maxBidDepth);

    return {
      asks: asks.map((level) => ({
        price: level.price,
        depth: toNumber(level.cumulativeQuantity),
        width: maxDepth > 0 ? (toNumber(level.cumulativeQuantity) / maxDepth) * 100 : 0,
      })),
      bids: bids.map((level) => ({
        price: level.price,
        depth: toNumber(level.cumulativeQuantity),
        width: maxDepth > 0 ? (toNumber(level.cumulativeQuantity) / maxDepth) * 100 : 0,
      })),
      maxDepth,
    };
  }, [orderBook]);

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-100">Depth Chart</p>
        <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">{symbol.replace("USDT", "/USDT")}</p>
      </div>

      {points.maxDepth <= 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-700 px-3 py-5 text-center text-xs text-slate-500">
          No depth data yet.
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1">
            <p className="text-[11px] uppercase tracking-[0.12em] text-red-300">Asks</p>
            {points.asks.slice(-8).map((point) => (
              <div key={`ask-${point.price}`} className="relative overflow-hidden rounded bg-zinc-900 px-2 py-1 text-[11px]">
                <div className="absolute right-0 top-0 h-full bg-red-500/20" style={{ width: `${point.width}%` }} />
                <div className="relative flex items-center justify-between">
                  <span className="text-red-300">{point.price}</span>
                  <span className="text-slate-300">{formatDepth(point.depth)}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="space-y-1">
            <p className="text-[11px] uppercase tracking-[0.12em] text-emerald-300">Bids</p>
            {points.bids.slice(0, 8).map((point) => (
              <div key={`bid-${point.price}`} className="relative overflow-hidden rounded bg-zinc-900 px-2 py-1 text-[11px]">
                <div className="absolute right-0 top-0 h-full bg-emerald-500/20" style={{ width: `${point.width}%` }} />
                <div className="relative flex items-center justify-between">
                  <span className="text-emerald-300">{point.price}</span>
                  <span className="text-slate-300">{formatDepth(point.depth)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

