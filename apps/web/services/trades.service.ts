import { apiRequest } from "@/lib/api";

export interface TradeMessage {
  id: string;
  tradeId: string;
  senderId: string;
  body: string;
  attachmentKey?: string | null;
  createdAt: string;
}

export interface PaymentInstructions {
  method?: string;
  receiverName?: string;
  upiId?: string | null;
  bankName?: string | null;
  accountNumber?: string | null;
  ifsc?: string | null;
  fiatCurrency?: string;
  amountMinor?: string;
  note?: string;
}

export interface PaymentProof {
  paymentReference?: string | null;
  proofFileName?: string | null;
  proofMimeType?: string | null;
  proofUrl?: string | null;
  uploadedAt?: string;
}

export interface TradeDispute {
  id: string;
  tradeId: string;
  openedById: string;
  reason: string;
  evidenceKeys: string[];
  status: string;
  resolutionNote?: string | null;
  resolvedById?: string | null;
  resolvedAt?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface TradeRecord {
  id: string;
  offerId: string;
  buyer?: {
    id: string;
    username: string;
    email: string;
  };
  seller?: {
    id: string;
    username: string;
    email: string;
  };
  offer?: {
    id: string;
    asset: string;
    fiatCurrency: string;
    paymentMethod: string;
    paymentDetails?: PaymentInstructions | null;
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
  paymentInstructions?: PaymentInstructions | null;
  paymentProof?: PaymentProof | null;
  dispute?: TradeDispute | null;
  openedAt?: string;
  paidAt?: string | null;
  sellerPaymentConfirmedAt?: string | null;
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

  markPaid(
    token: string,
    tradeId: string,
    input: {
      paymentReference?: string;
      proofFileName?: string;
      proofMimeType?: string;
      proofUrl?: string;
    },
  ) {
    return apiRequest<TradeRecord>(`/trades/${tradeId}/mark-paid`, {
      method: "POST",
      token,
      body: JSON.stringify(input),
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

  openDispute(
    token: string,
    tradeId: string,
    reason: string,
    input?: { paymentReference?: string; proofFileName?: string; proofUrl?: string; evidenceKeys?: string[] },
  ) {
    return apiRequest(`/trades/${tradeId}/dispute`, {
      method: "POST",
      token,
      body: JSON.stringify({ reason, ...input }),
    }).catch(() =>
      apiRequest(`/disputes`, {
        method: "POST",
        token,
        body: JSON.stringify({ tradeId, reason, ...input }),
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
