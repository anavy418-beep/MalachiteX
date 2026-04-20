import { apiRequest } from "@/lib/api";

export interface PaperTradingAccountSummary {
  account: {
    id: string;
    currency: string;
    balance: string;
    balanceMinor: string;
    usedMargin: string;
    usedMarginMinor: string;
    reservedOrderMargin: string;
    reservedOrderMarginMinor: string;
    realizedPnl: string;
    realizedPnlMinor: string;
    unrealizedPnl: string;
    unrealizedPnlMinor: string;
    equity: string;
    equityMinor: string;
    createdAt: string;
    updatedAt: string;
  };
  positions: Array<{
    id: string;
    symbol: string;
    positionType: "LONG" | "SHORT";
    leverage: number;
    baseAsset: string;
    quoteAsset: string;
    quantity: string;
    quantityAtomic: string;
    averageEntryPrice: string;
    averageEntryPriceMinor: string;
    currentPrice: string;
    currentPriceMinor: string;
    currentNotional: string;
    currentNotionalMinor: string;
    margin: string;
    marginMinor: string;
    liquidationPrice: string | null;
    liquidationPriceMinor: string | null;
    stopLossPrice: string | null;
    stopLossPriceMinor: string | null;
    takeProfitPrice: string | null;
    takeProfitPriceMinor: string | null;
    unrealizedPnl: string;
    unrealizedPnlMinor: string;
    unrealizedPnlPercent: string;
    openedAt: string;
    updatedAt: string;
  }>;
  orders: Array<{
    id: string;
    symbol: string;
    positionType: "LONG" | "SHORT";
    side: "BUY" | "SELL";
    leverage: number;
    type: "MARKET" | "LIMIT";
    status: "OPEN" | "FILLED" | "CANCELLED";
    quantity: string;
    quantityAtomic: string;
    limitPrice: string | null;
    limitPriceMinor: string | null;
    executedPrice: string | null;
    executedPriceMinor: string | null;
    reservedMargin: string;
    reservedMarginMinor: string;
    notional: string;
    notionalMinor: string;
    stopLossPrice: string | null;
    stopLossPriceMinor: string | null;
    takeProfitPrice: string | null;
    takeProfitPriceMinor: string | null;
    realizedPnl: string;
    realizedPnlMinor: string;
    triggerReason: string | null;
    filledAt: string | null;
    createdAt: string;
  }>;
  tradeHistory: Array<{
    id: string;
    symbol: string;
    positionType: "LONG" | "SHORT";
    leverage: number;
    side: "BUY" | "SELL";
    quantity: string;
    quantityAtomic: string;
    entryPrice: string;
    entryPriceMinor: string;
    exitPrice: string;
    exitPriceMinor: string;
    realizedPnl: string;
    realizedPnlMinor: string;
    closeReason: string | null;
    openedAt: string;
    closedAt: string;
  }>;
}

export interface CreatePaperOrderInput {
  symbol: string;
  positionType: "LONG" | "SHORT";
  side: "BUY" | "SELL";
  orderType: "MARKET" | "LIMIT";
  leverage: "1" | "2" | "5" | "10";
  quantity: string;
  limitPrice?: string;
  stopLossPrice?: string;
  takeProfitPrice?: string;
}

export interface UpdatePaperRiskInput {
  stopLossPrice?: string;
  takeProfitPrice?: string;
}

export const paperTradingService = {
  getAccount(token: string) {
    return apiRequest<PaperTradingAccountSummary>("/paper-trading/account", { token });
  },

  createAccount(token: string) {
    return apiRequest<PaperTradingAccountSummary>("/paper-trading/account", {
      method: "POST",
      token,
    });
  },

  placeOrder(token: string, input: CreatePaperOrderInput) {
    return apiRequest<PaperTradingAccountSummary>("/paper-trading/orders", {
      method: "POST",
      token,
      body: JSON.stringify(input),
    });
  },

  closePosition(token: string, symbol: string) {
    return apiRequest<PaperTradingAccountSummary>(`/paper-trading/positions/${symbol}/close`, {
      method: "POST",
      token,
    });
  },

  cancelOrder(token: string, orderId: string) {
    return apiRequest<PaperTradingAccountSummary>(`/paper-trading/orders/${orderId}/cancel`, {
      method: "POST",
      token,
    });
  },

  updatePositionRisk(token: string, symbol: string, input: UpdatePaperRiskInput) {
    return apiRequest<PaperTradingAccountSummary>(`/paper-trading/positions/${symbol}/risk`, {
      method: "POST",
      token,
      body: JSON.stringify(input),
    });
  },
};
