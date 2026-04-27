import { apiRequest } from "@/lib/api";

const DEMO_OFFERS_STORAGE_KEY = "malachitex_demo_offers_v1";

export interface OfferRecord {
  id: string;
  userId: string;
  merchantName?: string;
  type: "BUY" | "SELL";
  status?: "ACTIVE" | "PAUSED" | "ARCHIVED" | string;
  asset: string;
  fiatCurrency: string;
  priceMinor: string;
  minAmountMinor: string;
  maxAmountMinor: string;
  paymentMethod: string;
  paymentDetails?: PaymentDetails | null;
  terms?: string | null;
  createdAt?: string;
}

export interface PaymentDetails {
  receiverName?: string;
  upiId?: string;
  bankName?: string;
  accountNumber?: string;
  ifsc?: string;
}

export interface CreateOfferInput {
  type: "BUY" | "SELL";
  asset: string;
  fiatCurrency: string;
  priceMinor: string;
  minAmountMinor: string;
  maxAmountMinor: string;
  paymentMethod: string;
  paymentReceiverName?: string;
  paymentUpiId?: string;
  paymentBankName?: string;
  paymentAccountNumber?: string;
  paymentIfsc?: string;
  terms?: string;
}

interface OfferListOptions {
  includeLocalDemoFallback?: boolean;
}

function isBrowser() {
  return typeof window !== "undefined";
}

function readDemoOffers(): OfferRecord[] {
  if (!isBrowser()) return [];

  try {
    const raw = localStorage.getItem(DEMO_OFFERS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as OfferRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeDemoOffers(offers: OfferRecord[]) {
  if (!isBrowser()) return;
  localStorage.setItem(DEMO_OFFERS_STORAGE_KEY, JSON.stringify(offers));
}

function mergeUniqueOffers(primary: OfferRecord[], secondary: OfferRecord[]) {
  const map = new Map<string, OfferRecord>();
  [...primary, ...secondary].forEach((offer) => {
    map.set(offer.id, offer);
  });
  return [...map.values()].filter((offer) => {
    const status = (offer.status ?? "ACTIVE").toUpperCase();
    return status !== "ARCHIVED" && status !== "DELETED";
  });
}

function makeDemoOffer(input: CreateOfferInput, fallback: { userId: string; merchantName?: string }) {
  return {
    id: `demo-offer-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    userId: fallback.userId,
    merchantName: fallback.merchantName,
    type: input.type,
    status: "ACTIVE",
    asset: input.asset.toUpperCase(),
    fiatCurrency: input.fiatCurrency.toUpperCase(),
    priceMinor: input.priceMinor,
    minAmountMinor: input.minAmountMinor,
    maxAmountMinor: input.maxAmountMinor,
    paymentMethod: input.paymentMethod,
    paymentDetails: {
      receiverName: input.paymentReceiverName,
      upiId: input.paymentUpiId,
      bankName: input.paymentBankName,
      accountNumber: input.paymentAccountNumber,
      ifsc: input.paymentIfsc,
    },
    terms: input.terms ?? "",
    createdAt: new Date().toISOString(),
  } satisfies OfferRecord;
}

function normalizeOffer(offer: OfferRecord): OfferRecord {
  return {
    ...offer,
    status: offer.status ?? "ACTIVE",
    asset: offer.asset.toUpperCase(),
    fiatCurrency: offer.fiatCurrency.toUpperCase(),
  };
}

export const offersService = {
  async list(options: OfferListOptions = {}) {
    const { includeLocalDemoFallback = true } = options;
    const demoOffers = includeLocalDemoFallback ? readDemoOffers().map(normalizeOffer) : [];

    try {
      const apiOffers = await apiRequest<OfferRecord[]>("/offers");
      if (!includeLocalDemoFallback) {
        return apiOffers.map(normalizeOffer);
      }
      return mergeUniqueOffers(apiOffers.map(normalizeOffer), demoOffers);
    } catch (error) {
      if (!includeLocalDemoFallback) {
        throw error;
      }

      return demoOffers;
    }
  },

  async listMine(token: string, userId: string) {
    try {
      const mine = await apiRequest<OfferRecord[]>("/offers/mine", { token });
      return mine.filter((offer) => {
        const status = (offer.status ?? "ACTIVE").toUpperCase();
        return status !== "ARCHIVED" && status !== "DELETED";
      });
    } catch {
      const offers = await this.list();
      return offers.filter((offer) => offer.userId === userId);
    }
  },

  async create(
    token: string,
    input: CreateOfferInput,
    fallback?: { userId?: string; merchantName?: string },
  ) {
    try {
      const created = await apiRequest<OfferRecord>("/offers", {
        method: "POST",
        token,
        body: JSON.stringify(input),
      });
      return normalizeOffer(created);
    } catch {
      if (!fallback?.userId) {
        throw new Error("Offer API unavailable and fallback user context is missing.");
      }

      const created = makeDemoOffer(input, {
        userId: fallback.userId,
        merchantName: fallback.merchantName,
      });
      const existing = readDemoOffers();
      writeDemoOffers([created, ...existing]);
      return created;
    }
  },

  async updateStatus(
    token: string,
    offerId: string,
    status: "ACTIVE" | "PAUSED",
    seedOffer?: OfferRecord,
  ) {
    try {
      await apiRequest<OfferRecord>(`/offers/${offerId}/status`, {
        method: "PATCH",
        token,
        body: JSON.stringify({ status }),
      });
      return;
    } catch {
      const offers = readDemoOffers();
      const existing = offers.find((offer) => offer.id === offerId);
      const next = existing
        ? offers.map((offer) => (offer.id === offerId ? { ...offer, status } : offer))
        : seedOffer
          ? [{ ...seedOffer, status }, ...offers]
          : offers;
      writeDemoOffers(next);
    }
  },

  async remove(token: string, offerId: string, seedOffer?: OfferRecord) {
    try {
      await apiRequest<OfferRecord>(`/offers/${offerId}`, {
        method: "DELETE",
        token,
      });
      return;
    } catch {
      const offers = readDemoOffers();
      const existing = offers.find((offer) => offer.id === offerId);
      const next = existing
        ? offers.map((offer) => (offer.id === offerId ? { ...offer, status: "ARCHIVED" } : offer))
        : seedOffer
          ? [{ ...seedOffer, status: "ARCHIVED" }, ...offers]
          : offers;
      writeDemoOffers(next);
    }
  },
};
