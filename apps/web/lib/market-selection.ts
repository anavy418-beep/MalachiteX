import { MARKET_TIMEFRAMES, type MarketTickerSnapshot } from "@/services/markets.service";

const MARKET_SYMBOL_PATTERN = /^[A-Z0-9]{5,20}$/;
const DEFAULT_SYMBOL = "BTCUSDT";
const DEFAULT_INTERVAL = "1h";
export const DEFAULT_SUPPORTED_MARKET_SYMBOLS = [
  "BTCUSDT",
  "ETHUSDT",
  "SOLUSDT",
  "BNBUSDT",
  "XRPUSDT",
  "DOGEUSDT",
] as const;

export type MarketTimeframe = (typeof MARKET_TIMEFRAMES)[number];

export function normalizeMarketSymbol(value: string | null | undefined, fallback = DEFAULT_SYMBOL) {
  const normalized = parseMarketSymbol(value);
  return normalized ?? fallback;
}

export function normalizeMarketTimeframe(
  value: string | null | undefined,
  fallback: MarketTimeframe = DEFAULT_INTERVAL,
): MarketTimeframe {
  if (!value) return fallback;
  return MARKET_TIMEFRAMES.includes(value as MarketTimeframe)
    ? (value as MarketTimeframe)
    : fallback;
}

export function buildMarketSelectionPath(
  pathname: string,
  symbol: string,
  interval: MarketTimeframe,
  baseSearchParams?: URLSearchParams | string,
) {
  const params = new URLSearchParams(baseSearchParams);
  params.set("symbol", symbol);
  params.set("interval", interval);
  return `${pathname}?${params.toString()}`;
}

export function normalizeMarketSymbolToSupported(
  value: string | null | undefined,
  supportedSymbols: readonly string[] = DEFAULT_SUPPORTED_MARKET_SYMBOLS,
  fallback = DEFAULT_SYMBOL,
) {
  const parsedFallback = normalizeMarketSymbol(fallback);
  const normalizedSupported = normalizeSupportedSymbolList(supportedSymbols, parsedFallback);
  const parsedValue = parseMarketSymbol(value);

  if (parsedValue && normalizedSupported.includes(parsedValue)) {
    return parsedValue;
  }

  return normalizedSupported[0] ?? parsedFallback;
}

export function normalizeMarketSelection({
  symbol,
  interval,
  supportedSymbols = DEFAULT_SUPPORTED_MARKET_SYMBOLS,
  fallbackSymbol = DEFAULT_SYMBOL,
  fallbackInterval = DEFAULT_INTERVAL as MarketTimeframe,
}: {
  symbol?: string | null;
  interval?: string | null;
  supportedSymbols?: readonly string[];
  fallbackSymbol?: string;
  fallbackInterval?: MarketTimeframe;
}) {
  return {
    symbol: normalizeMarketSymbolToSupported(symbol, supportedSymbols, fallbackSymbol),
    interval: normalizeMarketTimeframe(interval, fallbackInterval),
  };
}

export function shouldFallbackToDefaultMarketSymbol(errorMessage: string | null | undefined) {
  if (!errorMessage) return false;
  const normalized = errorMessage.toLowerCase();
  return (
    normalized.includes("invalid symbol") ||
    normalized.includes("unknown symbol") ||
    normalized.includes("unsupported symbol")
  );
}

export function withSelectedPair(
  pairs: MarketTickerSnapshot[],
  selectedSymbol: string,
): MarketTickerSnapshot[] {
  if (pairs.some((pair) => pair.symbol === selectedSymbol)) {
    return pairs;
  }

  return [
    {
      symbol: selectedSymbol,
      baseAsset: selectedSymbol.replace("USDT", ""),
      quoteAsset: "USDT",
      displaySymbol: selectedSymbol.replace("USDT", "/USDT"),
      lastPrice: "0",
      openPrice: "0",
      highPrice: "0",
      lowPrice: "0",
      priceChange: "0",
      priceChangePercent: "0",
      volume: "0",
      quoteVolume: "0",
      bidPrice: "0",
      askPrice: "0",
      tradeCount: 0,
      openTime: 0,
      closeTime: 0,
      updatedAt: 0,
      source: "binance",
      streaming: false,
    },
    ...pairs,
  ];
}

function parseMarketSymbol(value: string | null | undefined) {
  const normalized = value?.trim().toUpperCase() ?? "";
  if (!normalized) return null;
  if (!normalized.endsWith("USDT")) return null;
  if (!MARKET_SYMBOL_PATTERN.test(normalized)) return null;
  return normalized;
}

function normalizeSupportedSymbolList(supportedSymbols: readonly string[], fallbackSymbol: string) {
  const normalized = new Set<string>([fallbackSymbol]);
  supportedSymbols.forEach((symbol) => {
    const parsed = parseMarketSymbol(symbol);
    if (parsed) {
      normalized.add(parsed);
    }
  });
  return [...normalized];
}
