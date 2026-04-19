import { apiRequest } from "@/lib/api";

export interface TradeMessage {
  id: string;
  tradeId: string;
  senderId: string;
  body: string;
  createdAt: string;
}

export interface TradeRecord {
  id: string;
  offerId: string;
  offer?: {
    id: string;
    asset: string;
    fiatCurrency: string;
    paymentMethod: string;
    terms?: string | null;
    minAmountMinor?: string;
    maxAmountMinor?: string;
  };
  buyerId: string;
  sellerId: string;
  amountMinor: string;
  fiatPriceMinor: string;
  fiatTotalMinor: string;
  escrowHeldMinor: string;
  status: string;
  openedAt?: string;
  paidAt?: string | null;
  releasedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  chat?: TradeMessage[];
}

export const tradesService = {
  listMine(token: string) {
    return apiRequest<TradeRecord[]>("/trades", { token });
  },

  getById(token: string, tradeId: string) {
    return apiRequest<TradeRecord>(`/trades/${tradeId}`, { token });
  },

  create(token: string, input: { offerId: string; amountMinor: string }) {
    return apiRequest<TradeRecord>("/trades", {
      method: "POST",
      token,
      body: JSON.stringify(input),
    });
  },

  markPaid(token: string, tradeId: string) {
    return apiRequest<TradeRecord>(`/trades/${tradeId}/mark-paid`, {
      method: "POST",
      token,
    });
  },

  release(token: string, tradeId: string) {
    return apiRequest<TradeRecord>(`/trades/${tradeId}/release`, {
      method: "POST",
      token,
    });
  },

  cancel(token: string, tradeId: string) {
    return apiRequest<TradeRecord>(`/trades/${tradeId}/cancel`, {
      method: "POST",
      token,
    });
  },

  openDispute(token: string, tradeId: string, reason: string) {
    return apiRequest(`/trades/${tradeId}/dispute`, {
      method: "POST",
      token,
      body: JSON.stringify({ reason }),
    }).catch(() =>
      apiRequest(`/disputes`, {
        method: "POST",
        token,
        body: JSON.stringify({ tradeId, reason }),
      }),
    );
  },

  listMessages(token: string, tradeId: string) {
    return apiRequest<TradeMessage[]>(`/chat/trades/${tradeId}/messages`, { token });
  },

  sendMessage(token: string, tradeId: string, body: string) {
    return apiRequest<{ message: TradeMessage; botMessage?: TradeMessage | null }>(
      `/chat/trades/${tradeId}/messages`,
      {
        method: "POST",
        token,
        body: JSON.stringify({ body }),
      },
    );
  },
};
