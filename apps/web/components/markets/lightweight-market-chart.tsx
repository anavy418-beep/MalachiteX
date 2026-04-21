"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { CandlestickChart } from "@/components/markets/candlestick-chart";
import type { MarketCandle } from "@/services/markets.service";
import type { CandlestickData, HistogramData, UTCTimestamp } from "lightweight-charts";

type StreamState = "LIVE" | "RECONNECTING" | "DELAYED";

interface LightweightMarketChartProps {
  candles: MarketCandle[];
  symbol: string;
  interval: string;
  currentPrice?: string | null;
  streamState?: StreamState;
  className?: string;
}

interface CandlePoint {
  time: UTCTimestamp;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

function parseCandle(candle: MarketCandle): CandlePoint | null {
  const open = Number.parseFloat(candle.open);
  const high = Number.parseFloat(candle.high);
  const low = Number.parseFloat(candle.low);
  const close = Number.parseFloat(candle.close);
  const volume = Number.parseFloat(candle.volume);

  if (![open, high, low, close, volume].every((value) => Number.isFinite(value))) {
    return null;
  }

  return {
    time: Math.floor(candle.openTime / 1000) as UTCTimestamp,
    open,
    high,
    low,
    close,
    volume,
  };
}

export function LightweightMarketChart({
  candles,
  symbol,
  interval,
  currentPrice,
  streamState = "LIVE",
  className,
}: LightweightMarketChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<any>(null);
  const candleSeriesRef = useRef<any>(null);
  const volumeSeriesRef = useRef<any>(null);
  const lastPriceLineRef = useRef<any>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const viewKeyRef = useRef("");

  const parsedCandles = useMemo(
    () =>
      candles
        .map(parseCandle)
        .filter((candle): candle is CandlePoint => candle !== null)
        .sort((left, right) => left.time - right.time),
    [candles],
  );

  const candleSeriesData = useMemo<CandlestickData[]>(
    () =>
      parsedCandles.map((entry) => ({
        time: entry.time,
        open: entry.open,
        high: entry.high,
        low: entry.low,
        close: entry.close,
      })),
    [parsedCandles],
  );

  const volumeSeriesData = useMemo<HistogramData[]>(
    () =>
      parsedCandles.map((entry) => ({
        time: entry.time,
        value: entry.volume,
        color: entry.close >= entry.open ? "rgba(16,185,129,0.45)" : "rgba(248,113,113,0.45)",
      })),
    [parsedCandles],
  );

  const effectivePrice = useMemo(() => {
    if (currentPrice) {
      const parsed = Number.parseFloat(currentPrice);
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
      }
    }

    const lastCandle = parsedCandles[parsedCandles.length - 1];
    return lastCandle ? lastCandle.close : null;
  }, [currentPrice, parsedCandles]);

  useEffect(() => {
    let cancelled = false;
    let observer: ResizeObserver | null = null;

    const initialize = async () => {
      if (!containerRef.current) return;

      try {
        const { ColorType, createChart } = await import("lightweight-charts");
        if (cancelled || !containerRef.current) return;

        const width = Math.max(320, Math.floor(containerRef.current.clientWidth));
        const height = Math.max(320, Math.floor(containerRef.current.clientHeight));

        const chart = createChart(containerRef.current, {
          width,
          height,
          layout: {
            background: { type: ColorType.Solid, color: "transparent" },
            textColor: "rgba(148,163,184,0.86)",
            fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
            fontSize: 11,
          },
          grid: {
            vertLines: { color: "rgba(148,163,184,0.08)" },
            horzLines: { color: "rgba(148,163,184,0.08)" },
          },
          rightPriceScale: {
            borderVisible: false,
          },
          timeScale: {
            borderVisible: false,
            timeVisible: interval !== "1d",
            secondsVisible: false,
          },
          crosshair: {
            mode: 0,
          },
        });

        const candleSeries = chart.addCandlestickSeries({
          upColor: "#10b981",
          downColor: "#ef4444",
          borderVisible: false,
          wickUpColor: "#34d399",
          wickDownColor: "#f87171",
          priceLineVisible: false,
        });

        const volumeSeries = chart.addHistogramSeries({
          priceScaleId: "volume",
          lastValueVisible: false,
          priceLineVisible: false,
        });

        chart.priceScale("volume").applyOptions({
          scaleMargins: {
            top: 0.8,
            bottom: 0,
          },
          visible: false,
        });

        chart.priceScale("right").applyOptions({
          scaleMargins: {
            top: 0.08,
            bottom: 0.23,
          },
        });

        observer = new ResizeObserver((entries) => {
          const entry = entries[0];
          if (!entry) return;
          chart.applyOptions({
            width: Math.max(320, Math.floor(entry.contentRect.width)),
            height: Math.max(320, Math.floor(entry.contentRect.height)),
          });
        });

        observer.observe(containerRef.current);

        chartRef.current = chart;
        candleSeriesRef.current = candleSeries;
        volumeSeriesRef.current = volumeSeries;
        setLoadFailed(false);
      } catch {
        if (!cancelled) {
          setLoadFailed(true);
        }
      }
    };

    void initialize();

    return () => {
      cancelled = true;
      observer?.disconnect();
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      lastPriceLineRef.current = null;
    };
  }, [interval]);

  useEffect(() => {
    if (!candleSeriesRef.current || !volumeSeriesRef.current) return;
    candleSeriesRef.current.setData(candleSeriesData);
    volumeSeriesRef.current.setData(volumeSeriesData);
  }, [candleSeriesData, volumeSeriesData]);

  useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    if (!candleSeries) return;

    if (lastPriceLineRef.current) {
      candleSeries.removePriceLine(lastPriceLineRef.current);
      lastPriceLineRef.current = null;
    }

    if (effectivePrice === null) return;

    lastPriceLineRef.current = candleSeries.createPriceLine({
      price: effectivePrice,
      color: "#34d399",
      lineWidth: 1,
      axisLabelVisible: true,
      lineStyle: 2,
      title: "Mark",
    });
  }, [effectivePrice]);

  useEffect(() => {
    if (!chartRef.current) return;

    const viewKey = `${symbol}:${interval}`;
    if (viewKeyRef.current === viewKey) return;
    viewKeyRef.current = viewKey;
    chartRef.current.timeScale().fitContent();
  }, [interval, symbol]);

  if (loadFailed) {
    return <CandlestickChart candles={candles} symbol={symbol} interval={interval} className={className} />;
  }

  return (
    <div
      className={cn(
        "relative min-h-[360px] overflow-hidden rounded-2xl border border-emerald-900/40 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.12),transparent_42%),linear-gradient(180deg,rgba(3,7,18,0.96),rgba(2,6,23,0.96))]",
        className,
      )}
    >
      <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-4 py-3">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-emerald-300/90">Market Chart</p>
          <h3 className="text-lg font-semibold text-white">
            {symbol.replace("USDT", "/USDT")} <span className="text-sm font-medium text-slate-400">{interval}</span>
          </h3>
        </div>
        <span
          className={cn(
            "rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.18em]",
            streamState === "LIVE"
              ? "border-emerald-700/40 bg-emerald-950/30 text-emerald-200"
              : "border-amber-700/40 bg-amber-500/10 text-amber-200",
          )}
        >
          {streamState}
        </span>
      </div>

      <div className="h-[380px] w-full pt-16">
        <div ref={containerRef} className="h-full w-full" />
      </div>

      {parsedCandles.length === 0 ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-slate-400">
          Loading live chart...
        </div>
      ) : null}
    </div>
  );
}
