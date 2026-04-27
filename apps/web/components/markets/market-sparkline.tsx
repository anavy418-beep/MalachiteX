"use client";

import { memo, useEffect, useMemo, useRef } from "react";
import type { AreaSeriesPartialOptions, IChartApi, ISeriesApi, Time, UTCTimestamp } from "lightweight-charts";

export interface SparklinePoint {
  time: number;
  value: number;
}

interface MarketSparklineProps {
  points: SparklinePoint[];
  positive: boolean;
  className?: string;
}

const CHART_HEIGHT = 44;

function toChartData(points: SparklinePoint[]) {
  return points.map((point) => ({
    time: Math.floor(point.time / 1000) as UTCTimestamp,
    value: point.value,
  }));
}

function buildSeriesOptions(positive: boolean): AreaSeriesPartialOptions {
  if (positive) {
    return {
      lineColor: "#22c55e",
      topColor: "rgba(34,197,94,0.30)",
      bottomColor: "rgba(34,197,94,0.02)",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    };
  }

  return {
    lineColor: "#ef4444",
    topColor: "rgba(239,68,68,0.28)",
    bottomColor: "rgba(239,68,68,0.02)",
    lineWidth: 2,
    priceLineVisible: false,
    lastValueVisible: false,
    crosshairMarkerVisible: false,
  };
}

function MarketSparklineComponent({ points, positive, className }: MarketSparklineProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area", Time> | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const chartData = useMemo(() => toChartData(points), [points]);

  useEffect(() => {
    let cancelled = false;

    const initialize = async () => {
      if (!containerRef.current) return;

      const { ColorType, createChart } = await import("lightweight-charts");
      if (cancelled || !containerRef.current) return;

      const width = Math.max(84, Math.floor(containerRef.current.clientWidth || 120));
      const chart = createChart(containerRef.current, {
        width,
        height: CHART_HEIGHT,
        layout: {
          background: { type: ColorType.Solid, color: "transparent" },
          textColor: "rgba(148,163,184,0)",
        },
        grid: {
          vertLines: { visible: false },
          horzLines: { visible: false },
        },
        rightPriceScale: {
          visible: false,
          borderVisible: false,
        },
        leftPriceScale: {
          visible: false,
          borderVisible: false,
        },
        timeScale: {
          visible: false,
          borderVisible: false,
          fixLeftEdge: true,
          fixRightEdge: true,
        },
        crosshair: {
          vertLine: { visible: false, labelVisible: false },
          horzLine: { visible: false, labelVisible: false },
        },
        handleScroll: false,
        handleScale: false,
      });

      const series = chart.addAreaSeries(buildSeriesOptions(positive));
      series.setData(chartData);

      chartRef.current = chart;
      seriesRef.current = series;

      resizeObserverRef.current = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry || !chartRef.current) return;
        chartRef.current.applyOptions({
          width: Math.max(84, Math.floor(entry.contentRect.width)),
          height: CHART_HEIGHT,
        });
      });
      resizeObserverRef.current.observe(containerRef.current);
    };

    void initialize();

    return () => {
      cancelled = true;
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      chartRef.current?.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!seriesRef.current) return;
    seriesRef.current.applyOptions(buildSeriesOptions(positive));
  }, [positive]);

  useEffect(() => {
    if (!seriesRef.current) return;
    seriesRef.current.setData(chartData);
  }, [chartData]);

  if (points.length < 2) {
    return (
      <div
        className={`inline-flex h-[44px] w-[132px] items-center justify-center rounded-lg border border-zinc-800 bg-zinc-950/40 text-[10px] text-slate-500 ${className ?? ""}`}
      >
        Syncing...
      </div>
    );
  }

  return <div ref={containerRef} className={`h-[44px] w-[132px] ${className ?? ""}`} />;
}

export const MarketSparkline = memo(MarketSparklineComponent);

