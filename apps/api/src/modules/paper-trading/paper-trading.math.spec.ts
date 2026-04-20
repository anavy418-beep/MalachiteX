import {
  calculateAveragePriceMinor,
  calculateDirectionalPnlMinor,
  calculateLiquidationPriceMinor,
  calculateMarginMinor,
  calculatePnlPercentString,
  multiplyScaled,
  parseDecimalToScaledBigInt,
  prorateCostBasis,
  scaledBigIntToDecimalString,
} from "./paper-trading.math";

describe("paper-trading math", () => {
  it("parses and formats scaled decimals without precision loss", () => {
    const scaled = parseDecimalToScaledBigInt("1234.56789");
    expect(scaled.toString()).toBe("123456789000");
    expect(scaledBigIntToDecimalString(scaled)).toBe("1234.56789");
  });

  it("calculates quote notional for a base quantity", () => {
    const priceMinor = parseDecimalToScaledBigInt("64000.25");
    const quantityAtomic = parseDecimalToScaledBigInt("0.125");

    const notionalMinor = multiplyScaled(priceMinor, quantityAtomic);
    expect(scaledBigIntToDecimalString(notionalMinor)).toBe("8000.03125");
  });

  it("keeps entry price and cost basis consistent on partial reductions", () => {
    const originalCostBasis = parseDecimalToScaledBigInt("12000");
    const originalQuantity = parseDecimalToScaledBigInt("0.4");
    const closingQuantity = parseDecimalToScaledBigInt("0.1");

    const reducedCostBasis = prorateCostBasis(originalCostBasis, originalQuantity, closingQuantity);
    const remainingCostBasis = originalCostBasis - reducedCostBasis;
    const remainingQuantity = originalQuantity - closingQuantity;
    const averagePriceMinor = calculateAveragePriceMinor(remainingCostBasis, remainingQuantity);

    expect(scaledBigIntToDecimalString(reducedCostBasis)).toBe("3000");
    expect(scaledBigIntToDecimalString(averagePriceMinor)).toBe("30000");
  });

  it("calculates leveraged margin requirements using integer math", () => {
    const notionalMinor = parseDecimalToScaledBigInt("2500");
    expect(scaledBigIntToDecimalString(calculateMarginMinor(notionalMinor, 5))).toBe("500");
  });

  it("calculates long and short pnl correctly", () => {
    const entryPriceMinor = parseDecimalToScaledBigInt("50000");
    const currentPriceMinor = parseDecimalToScaledBigInt("48000");
    const quantityAtomic = parseDecimalToScaledBigInt("0.2");

    expect(
      scaledBigIntToDecimalString(
        calculateDirectionalPnlMinor("LONG", entryPriceMinor, currentPriceMinor, quantityAtomic),
      ),
    ).toBe("-400");
    expect(
      scaledBigIntToDecimalString(
        calculateDirectionalPnlMinor("SHORT", entryPriceMinor, currentPriceMinor, quantityAtomic),
      ),
    ).toBe("400");
  });

  it("calculates pnl percent from isolated margin", () => {
    const pnlMinor = parseDecimalToScaledBigInt("125");
    const marginMinor = parseDecimalToScaledBigInt("500");
    expect(calculatePnlPercentString(pnlMinor, marginMinor)).toBe("25");
  });

  it("derives simple liquidation levels for long and short positions", () => {
    const entryPriceMinor = parseDecimalToScaledBigInt("100");
    expect(scaledBigIntToDecimalString(calculateLiquidationPriceMinor("LONG", entryPriceMinor, 5))).toBe(
      "80.5",
    );
    expect(scaledBigIntToDecimalString(calculateLiquidationPriceMinor("SHORT", entryPriceMinor, 5))).toBe(
      "119.5",
    );
  });
});
