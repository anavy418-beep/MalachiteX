import { apiRequest } from "@/lib/api";
import type { OfferRecord } from "./offers.service";
import type { TradeRecord } from "./trades.service";
import type { WalletSummary } from "./wallet.service";

const READ_STORAGE_PREFIX = "malachitex_notifications_read_v1";

export type NotificationType = "TRADE_UPDATE" | "OFFER_UPDATE" | "WALLET_EVENT" | "SYSTEM_ALERT";
export type NotificationLevel = "INFO" | "WARN" | "CRITICAL";
export type NotificationScope = "ALL" | "P2P";

export interface AppNotification {
  id: string;
  type: NotificationType;
  level: NotificationLevel;
  title: string;
  message: string;
  createdAt: string;
  read: boolean;
}

interface BackendNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  data?: Record<string, unknown> | null;
  readAt?: string | null;
  createdAt: string;
}

function isBrowser() {
  return typeof window !== "undefined";
}

function storageKey(userId: string) {
  return `${READ_STORAGE_PREFIX}:${userId}`;
}

function readReadIds(userId: string) {
  if (!isBrowser()) return new Set<string>();

  try {
    const raw = localStorage.getItem(storageKey(userId));
    const parsed = raw ? (JSON.parse(raw) as string[]) : [];
    return new Set(parsed);
  } catch {
    return new Set<string>();
  }
}

function writeReadIds(userId: string, ids: Set<string>) {
  if (!isBrowser()) return;
  localStorage.setItem(storageKey(userId), JSON.stringify([...ids]));
}

function isDemoTradingNotification(item: Pick<BackendNotification, "title" | "message" | "data">) {
  const domain =
    item.data && typeof item.data === "object" && !Array.isArray(item.data)
      ? String(item.data.domain ?? "").toUpperCase()
      : "";
  if (domain === "DEMO_TRADING") return true;

  const text = `${item.title} ${item.message}`.toLowerCase();
  return text.includes("demo trading") || text.includes("paper trading") || text.includes("paper order") || text.includes("paper position");
}

function mapBackendType(item: BackendNotification): NotificationType {
  if (isDemoTradingNotification(item)) return "SYSTEM_ALERT";
  const upper = item.type.toUpperCase();
  if (upper.includes("TRADE")) return "TRADE_UPDATE";
  if (upper.includes("WALLET")) return "WALLET_EVENT";
  if (upper.includes("SYSTEM")) return "SYSTEM_ALERT";
  return "OFFER_UPDATE";
}

function mapLevel(input: { type: NotificationType; title: string; message: string }): NotificationLevel {
  const text = `${input.title} ${input.message}`.toLowerCase();
  if (text.includes("dispute") || text.includes("security") || text.includes("critical")) return "CRITICAL";
  if (text.includes("pending") || text.includes("awaiting") || text.includes("review")) return "WARN";
  return input.type === "SYSTEM_ALERT" ? "WARN" : "INFO";
}

function normalizeBackendNotification(item: BackendNotification): AppNotification {
  const mappedType = mapBackendType(item);
  return {
    id: item.id,
    type: mappedType,
    level: mapLevel({ type: mappedType, title: item.title, message: item.message }),
    title: item.title,
    message: item.message,
    createdAt: item.createdAt,
    read: Boolean(item.readAt),
  };
}

function buildDerivedNotifications(input: {
  userId: string;
  wallet: WalletSummary;
  trades: TradeRecord[];
  offers: OfferRecord[];
}): AppNotification[] {
  const readIds = readReadIds(input.userId);
  const notifications: Omit<AppNotification, "read">[] = [];

  const activeTrades = input.trades.filter((trade) => {
    const s = trade.status.toUpperCase();
    return (
      s === "OPEN" ||
      s === "PAYMENT_PENDING" ||
      s === "PAYMENT_SENT" ||
      s === "RELEASE_PENDING" ||
      s === "DISPUTED" ||
      s === "PENDING_PAYMENT" ||
      s === "PAID"
    );
  });
  if (activeTrades.length > 0) {
    notifications.push({
      id: "trade-awaiting",
      type: "TRADE_UPDATE",
      level: "WARN",
      title: "Trades awaiting action",
      message: `${activeTrades.length} trade(s) need attention.`,
      createdAt: new Date().toISOString(),
    });
  }

  const completedTrades = input.trades.filter((trade) => {
    const status = trade.status.toUpperCase();
    return status === "COMPLETED" || status === "RELEASED";
  });
  if (completedTrades.length > 0) {
    notifications.push({
      id: "trade-completed",
      type: "TRADE_UPDATE",
      level: "INFO",
      title: "Trades completed",
      message: `${completedTrades.length} trade(s) settled successfully.`,
      createdAt: new Date().toISOString(),
    });
  }

  const pendingWithdrawal = input.wallet.ledger.some((entry) =>
    entry.type.toUpperCase().includes("WITHDRAWAL_REQUEST"),
  );
  if (pendingWithdrawal) {
    notifications.push({
      id: "wallet-withdrawal-pending",
      type: "WALLET_EVENT",
      level: "INFO",
      title: "Withdrawal pending review",
      message: "A withdrawal request is currently pending.",
      createdAt: new Date().toISOString(),
    });
  }

  const activeOffers = input.offers.filter((offer) => {
    const status = (offer.status ?? "ACTIVE").toUpperCase();
    return status === "ACTIVE";
  });
  if (activeOffers.length > 0) {
    notifications.push({
      id: "offers-active",
      type: "OFFER_UPDATE",
      level: "INFO",
      title: "Offers in market",
      message: `${activeOffers.length} offer(s) are currently active.`,
      createdAt: new Date().toISOString(),
    });
  }

  notifications.push({
    id: "security-reminder",
    type: "SYSTEM_ALERT",
    level: "CRITICAL",
    title: "Security reminder",
    message: "Never release crypto outside verified payment confirmation.",
    createdAt: new Date().toISOString(),
  });

  return notifications.slice(0, 6).map((item) => ({
    ...item,
    read: readIds.has(item.id),
  }));
}

export const notificationService = {
  async list(input: {
    token: string;
    userId: string;
    wallet: WalletSummary;
    trades: TradeRecord[];
    offers: OfferRecord[];
    scope?: NotificationScope;
  }): Promise<AppNotification[]> {
    try {
      const response = await apiRequest<BackendNotification[]>("/notifications", {
        token: input.token,
      });

      if (response.length === 0) {
        return buildDerivedNotifications(input);
      }

      const filteredResponse =
        (input.scope ?? "ALL") === "P2P"
          ? response.filter((item) => !isDemoTradingNotification(item))
          : response;

      return filteredResponse.map(normalizeBackendNotification);
    } catch {
      return buildDerivedNotifications(input);
    }
  },

  async markAsRead(userId: string, notificationId: string, token?: string) {
    if (token) {
      try {
        await apiRequest(`/notifications/${notificationId}/read`, {
          method: "PATCH",
          token,
        });
        return;
      } catch {
        // fallback to local read cache in demo mode
      }
    }

    const ids = readReadIds(userId);
    ids.add(notificationId);
    writeReadIds(userId, ids);
  },

  async markAllAsRead(userId: string, notificationIds: string[], token?: string) {
    if (token) {
      try {
        await Promise.all(
          notificationIds.map((id) =>
            apiRequest(`/notifications/${id}/read`, {
              method: "PATCH",
              token,
            }),
          ),
        );
        return;
      } catch {
        // fallback to local read cache in demo mode
      }
    }

    const ids = readReadIds(userId);
    notificationIds.forEach((id) => ids.add(id));
    writeReadIds(userId, ids);
  },
};
