const SCALE_FACTOR_CACHE = new Map<number, bigint>();

function getScaleFactor(scale: number) {
  let factor = SCALE_FACTOR_CACHE.get(scale);
  if (!factor) {
    factor = 10n ** BigInt(scale);
    SCALE_FACTOR_CACHE.set(scale, factor);
  }
  return factor;
}

export function parseDecimalToScaledBigInt(value: string, scale = 8): bigint {
  const normalized = value.trim();
  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    throw new Error("Invalid decimal value");
  }

  const [wholePart = "0", fractionalPart = ""] = normalized.split(".");
  const factor = getScaleFactor(scale);
  const paddedFraction = `${fractionalPart}${"0".repeat(scale)}`.slice(0, scale);

  return BigInt(wholePart || "0") * factor + BigInt(paddedFraction.length > 0 ? paddedFraction : "0");
}

export function scaledBigIntToDecimalString(value: bigint, scale = 8): string {
  const factor = getScaleFactor(scale);
  const negative = value < 0n;
  const absolute = negative ? value * -1n : value;
  const whole = absolute / factor;
  const fraction = (absolute % factor).toString().padStart(scale, "0").replace(/0+$/, "");
  const sign = negative ? "-" : "";
  return fraction ? `${sign}${whole.toString()}.${fraction}` : `${sign}${whole.toString()}`;
}

export function multiplyScaled(left: bigint, right: bigint, scale = 8): bigint {
  return (left * right) / getScaleFactor(scale);
}

export function divideBigIntRoundedUp(value: bigint, divisor: bigint) {
  if (divisor <= 0n) {
    throw new Error("Divisor must be greater than zero");
  }

  if (value === 0n) return 0n;
  if (value > 0n) {
    return (value + divisor - 1n) / divisor;
  }

  return value / divisor;
}

export function calculateAveragePriceMinor(costBasisMinor: bigint, quantityAtomic: bigint, scale = 8): bigint {
  if (quantityAtomic <= 0n) return 0n;
  return (costBasisMinor * getScaleFactor(scale)) / quantityAtomic;
}

export function prorateCostBasis(costBasisMinor: bigint, totalQuantityAtomic: bigint, quantityAtomic: bigint): bigint {
  if (totalQuantityAtomic <= 0n || quantityAtomic <= 0n) return 0n;
  return (costBasisMinor * quantityAtomic) / totalQuantityAtomic;
}

export function normalizeTradingSymbol(symbol: string) {
  return symbol.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function calculateMarginMinor(notionalMinor: bigint, leverage: number) {
  return divideBigIntRoundedUp(notionalMinor, BigInt(leverage));
}

export function calculateDirectionalPnlMinor(
  positionType: "LONG" | "SHORT",
  entryPriceMinor: bigint,
  currentPriceMinor: bigint,
  quantityAtomic: bigint,
) {
  const priceDeltaMinor = currentPriceMinor - entryPriceMinor;
  const directionalDeltaMinor = positionType === "LONG" ? priceDeltaMinor : priceDeltaMinor * -1n;
  return multiplyScaled(directionalDeltaMinor, quantityAtomic);
}

export function calculatePnlPercentString(pnlMinor: bigint, marginMinor: bigint, scale = 4) {
  if (marginMinor <= 0n) return "0";
  const precisionFactor = getScaleFactor(scale);
  const percentScaled = (pnlMinor * 100n * precisionFactor) / marginMinor;
  return scaledBigIntToDecimalString(percentScaled, scale);
}

export function calculateLiquidationPriceMinor(
  positionType: "LONG" | "SHORT",
  entryPriceMinor: bigint,
  leverage: number,
  maintenanceMarginBps = 50n,
) {
  const scaleBps = 10_000n;
  const leverageBps = scaleBps / BigInt(leverage);

  if (positionType === "LONG") {
    const multiplierBps = scaleBps - leverageBps + maintenanceMarginBps;
    return (entryPriceMinor * multiplierBps) / scaleBps;
  }

  const multiplierBps = scaleBps + leverageBps - maintenanceMarginBps;
  return (entryPriceMinor * multiplierBps) / scaleBps;
}
