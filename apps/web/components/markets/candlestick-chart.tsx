"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { MarketCandle } from "@/services/markets.service";

interface CandlestickChartProps {
  candles: MarketCandle[];
  symbol: string;
  interval: string;
  className?: string;
}

interface ChartDimensions {
  width: number;
  height: number;
}

const PADDING = { top: 14, right: 64, bottom: 26, left: 10 };
const VOLUME_HEIGHT = 72;

function formatCompact(value: number) {
  if (!Number.isFinite(value)) return "-";
  if (value >= 1000) {
    return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
  }
  if (value >= 1) {
    return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  return value.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

export function CandlestickChart({
  candles,
  symbol,
  interval,
  className,
}: CandlestickChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dimensions, setDimensions] = useState<ChartDimensions>({ width: 720, height: 420 });

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;

      setDimensions({
        width: Math.max(320, Math.floor(entry.contentRect.width)),
        height: Math.max(320, Math.floor(entry.contentRect.height)),
      });
    });

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const model = useMemo(() => {
    if (candles.length === 0) {
      return null;
    }

    const high = Math.max(...candles.map((candle) => Number.parseFloat(candle.high)));
    const low = Math.min(...candles.map((candle) => Number.parseFloat(candle.low)));
    const maxVolume = Math.max(...candles.map((candle) => Number.parseFloat(candle.volume)));
    const priceRange = high - low || 1;
    const priceHeight = dimensions.height - PADDING.top - PADDING.bottom - VOLUME_HEIGHT;
    const innerWidth = dimensions.width - PADDING.left - PADDING.right;
    const candleWidth = Math.max(4, Math.floor(innerWidth / Math.max(candles.length, 1)) - 2);

    const toY = (value: number) =>
      PADDING.top + ((high - value) / priceRange) * Math.max(priceHeight, 1);

    const toVolumeHeight = (value: number) =>
      (value / Math.max(maxVolume, 1)) * Math.max(VOLUME_HEIGHT - 12, 12);

    const priceLabels = Array.from({ length: 5 }, (_, index) => {
      const ratio = index / 4;
      const value = high - priceRange * ratio;
      return {
        value,
        y: PADDING.top + ratio * priceHeight,
      };
    });

    const timeLabels = candles
      .filter((_, index) => index === 0 || index === candles.length - 1 || index % Math.max(Math.floor(candles.length / 4), 1) === 0)
      .map((candle) => ({
        x:
          PADDING.left +
          candles.findIndex((entry) => entry.openTime === candle.openTime) * (candleWidth + 2) +
          candleWidth / 2,
        label: new Date(candle.openTime).toLocaleString(undefined, {
          month: "short",
          day: "numeric",
          hour: candles.length > 36 ? undefined : "2-digit",
          minute: candles.length > 36 ? undefined : "2-digit",
        }),
      }));

    return {
      high,
      low,
      candleWidth,
      priceLabels,
      timeLabels,
      candles: candles.map((candle, index) => {
        const open = Number.parseFloat(candle.open);
        const close = Number.parseFloat(candle.close);
        const highValue = Number.parseFloat(candle.high);
        const lowValue = Number.parseFloat(candle.low);
        const volume = Number.parseFloat(candle.volume);
        const x = PADDING.left + index * (candleWidth + 2) + candleWidth / 2;
        const rising = close >= open;
        const bodyTop = toY(Math.max(open, close));
        const bodyBottom = toY(Math.min(open, close));
        const bodyHeight = Math.max(2, bodyBottom - bodyTop);
        const volumeHeight = toVolumeHeight(volume);

        return {
          ...candle,
          open,
          close,
          highValue,
          lowValue,
          x,
          rising,
          wickTop: toY(highValue),
          wickBottom: toY(lowValue),
          bodyTop,
          bodyHeight,
          volumeTop: dimensions.height - PADDING.bottom - volumeHeight,
          volumeHeight,
        };
      }),
    };
  }, [candles, dimensions.height, dimensions.width]);

  return (
    <div
      ref={containerRef}
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
        <div className="rounded-full border border-emerald-800/40 bg-emerald-950/30 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-emerald-200">
          Demo feed
        </div>
      </div>

      {!model ? (
        <div className="flex h-full min-h-[360px] items-center justify-center text-sm text-slate-400">
          Loading chart data...
        </div>
      ) : (
        <svg viewBox={`0 0 ${dimensions.width} ${dimensions.height}`} className="h-full w-full">
          {model.priceLabels.map((label) => (
            <g key={label.y}>
              <line
                x1={PADDING.left}
                y1={label.y}
                x2={dimensions.width - PADDING.right}
                y2={label.y}
                stroke="rgba(148,163,184,0.12)"
                strokeDasharray="4 6"
              />
              <text
                x={dimensions.width - PADDING.right + 8}
                y={label.y + 4}
                fill="rgba(148,163,184,0.85)"
                fontSize="11"
              >
                {formatCompact(label.value)}
              </text>
            </g>
          ))}

          {model.candles.map((candle) => (
            <g key={`${candle.openTime}-${candle.interval}`}>
              <line
                x1={candle.x}
                y1={candle.wickTop}
                x2={candle.x}
                y2={candle.wickBottom}
                stroke={candle.rising ? "#34d399" : "#f87171"}
                strokeWidth="1.2"
              />
              <rect
                x={candle.x - model.candleWidth / 2}
                y={candle.bodyTop}
                width={model.candleWidth}
                height={candle.bodyHeight}
                rx="1.5"
                fill={candle.rising ? "#10b981" : "#ef4444"}
                opacity="0.94"
              />
              <rect
                x={candle.x - model.candleWidth / 2}
                y={candle.volumeTop}
                width={model.candleWidth}
                height={candle.volumeHeight}
                rx="1"
                fill={candle.rising ? "rgba(16,185,129,0.35)" : "rgba(239,68,68,0.35)"}
              />
            </g>
          ))}

          {model.timeLabels.map((label) => (
            <text
              key={`${label.x}-${label.label}`}
              x={label.x}
              y={dimensions.height - 8}
              textAnchor="middle"
              fill="rgba(148,163,184,0.75)"
              fontSize="10"
            >
              {label.label}
            </text>
          ))}
        </svg>
      )}
    </div>
  );
}
