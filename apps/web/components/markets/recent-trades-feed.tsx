"use client";

import type { MarketRecentTrade } from "@/services/markets.service";

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

function formatAmount(value: string) {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return "-";

  return parsed.toLocaleString(undefined, {
    minimumFractionDigits: parsed >= 1 ? 2 : 4,
    maximumFractionDigits: parsed >= 1 ? 4 : 8,
  });
}

function formatTime(timestamp: number) {
  if (!timestamp) return "-";
  return new Date(timestamp).toLocaleTimeString([], {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function RecentTradesFeed({
  symbol,
  trades,
  rows = 18,
}: {
  symbol: string;
  trades: MarketRecentTrade[];
  rows?: number;
}) {
  const visibleTrades = trades.slice(0, rows);

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60">
      <div className="border-b border-zinc-800 px-4 py-3">
        <p className="text-sm font-semibold text-slate-100">Recent Trades</p>
        <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">{symbol.replace("USDT", "/USDT")}</p>
      </div>

      <div className="grid grid-cols-3 px-4 py-2 text-[11px] uppercase tracking-[0.16em] text-slate-500">
        <span>Price</span>
        <span className="text-right">Amount</span>
        <span className="text-right">Time</span>
      </div>

      <div className="space-y-1 px-2 pb-2">
        {visibleTrades.length === 0 ? (
          <div className="px-2 py-8 text-center text-sm text-slate-500">No trades yet for this pair.</div>
        ) : (
          visibleTrades.map((trade) => (
            <div key={trade.tradeId} className="grid grid-cols-3 rounded-lg px-2 py-1 text-xs">
              <span className={trade.side === "BUY" ? "text-emerald-300" : "text-red-300"}>
                {formatPrice(trade.price)}
              </span>
              <span className="text-right text-slate-300">{formatAmount(trade.quantity)}</span>
              <span className="text-right text-slate-500">{formatTime(trade.tradedAt)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

