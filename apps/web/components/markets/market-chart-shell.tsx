"use client";

import { CandlestickChart } from "@/components/markets/candlestick-chart";
import { LightweightMarketChart } from "@/components/markets/lightweight-market-chart";
import type { MarketCandle } from "@/services/markets.service";

type ChartProvider = "native" | "lightweight" | "tradingview";
type StreamState = "LIVE" | "RECONNECTING" | "DELAYED";

export function MarketChartShell({
  candles,
  symbol,
  interval,
  provider = "lightweight",
  currentPrice,
  streamState = "LIVE",
}: {
  candles: MarketCandle[];
  symbol: string;
  interval: string;
  provider?: ChartProvider;
  currentPrice?: string | null;
  streamState?: StreamState;
}) {
  if (provider === "native") {
    return <CandlestickChart candles={candles} symbol={symbol} interval={interval} />;
  }

  return (
    <LightweightMarketChart
      candles={candles}
      symbol={symbol}
      interval={interval}
      currentPrice={currentPrice}
      streamState={streamState}
    />
  );
}
