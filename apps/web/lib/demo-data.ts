import type { DepositRecord, WalletSummary, WithdrawalRecord } from "@/services/wallet.service";
import { getDemoWalletIdentity, type WalletNetwork } from "@/lib/wallet-identity";

export type { WalletNetwork } from "@/lib/wallet-identity";
export type OfferSide = "BUY" | "SELL";
export type MerchantBadge = "VERIFIED" | "POWER" | "AMBASSADOR";

const demoIdentity = getDemoWalletIdentity("malachitex:demo:wallet", "USDT");

export const DEMO_WALLET_SUMMARY: WalletSummary = {
  currency: "INR",
  availableBalanceMinor: "2450000",
  escrowBalanceMinor: "375000",
  walletId: demoIdentity.walletId,
  depositAddresses: demoIdentity.addresses,
  ledger: [
    { id: "dw1", type: "DEPOSIT", amountMinor: "1200000", createdAt: new Date().toISOString() },
    { id: "dw2", type: "WITHDRAWAL_REQUEST", amountMinor: "-350000", createdAt: new Date().toISOString() },
    { id: "dw3", type: "TRADE_ESCROW_HOLD", amountMinor: "-125000", createdAt: new Date().toISOString() },
  ],
};

export const DEMO_DEPOSITS: DepositRecord[] = [
  {
    id: "dd1",
    amountMinor: "500000",
    txRef: "MX-DEMO-9182",
    status: "CONFIRMED",
    createdAt: new Date().toISOString(),
  },
  {
    id: "dd2",
    amountMinor: "300000",
    txRef: "MX-DEMO-9150",
    status: "PENDING",
    createdAt: new Date().toISOString(),
  },
];

export const DEMO_WITHDRAWALS: WithdrawalRecord[] = [
  {
    id: "dw1",
    amountMinor: "250000",
    destination: "UPI: trader@bank",
    status: "PENDING",
    createdAt: new Date().toISOString(),
  },
  {
    id: "dw2",
    amountMinor: "125000",
    destination: "Bank: XXXX9821",
    status: "APPROVED",
    createdAt: new Date().toISOString(),
  },
];

export interface DemoMerchant {
  id: string;
  name: string;
  avatar: string;
  badge?: MerchantBadge;
  completionRate: number;
  tradeCount: number;
  rating: number;
  online: boolean;
  lastSeen: string;
  trusted: boolean;
  responseMinutes: number;
}

export interface P2POfferPreview {
  id: string;
  type: OfferSide;
  asset: "USDT" | "BTC" | "ETH";
  fiatCurrency: "INR" | "USD";
  priceMinor: string;
  minAmountMinor: string;
  maxAmountMinor: string;
  paymentMethod: "Google Pay" | "UPI" | "Bank Transfer" | "Paytm";
  premiumPct: number;
  merchant: DemoMerchant;
  terms: string;
}

export const DEMO_P2P_MERCHANTS: DemoMerchant[] = [
  {
    id: "m1",
    name: "GreenDesk Capital",
    avatar: "GC",
    badge: "VERIFIED",
    completionRate: 99,
    tradeCount: 1242,
    rating: 4.9,
    online: true,
    lastSeen: "Online now",
    trusted: true,
    responseMinutes: 1,
  },
  {
    id: "m2",
    name: "Atlas OTC",
    avatar: "AO",
    badge: "POWER",
    completionRate: 98,
    tradeCount: 812,
    rating: 4.8,
    online: true,
    lastSeen: "Online now",
    trusted: true,
    responseMinutes: 2,
  },
  {
    id: "m3",
    name: "Malachite Ambassador",
    avatar: "MA",
    badge: "AMBASSADOR",
    completionRate: 97,
    tradeCount: 503,
    rating: 4.7,
    online: false,
    lastSeen: "7 min ago",
    trusted: true,
    responseMinutes: 4,
  },
  {
    id: "m4",
    name: "Prime Liquidity",
    avatar: "PL",
    completionRate: 95,
    tradeCount: 298,
    rating: 4.5,
    online: false,
    lastSeen: "22 min ago",
    trusted: false,
    responseMinutes: 8,
  },
];

export const DEMO_P2P_OFFERS: P2POfferPreview[] = [
  {
    id: "demo-offer-1",
    type: "SELL",
    asset: "USDT",
    fiatCurrency: "INR",
    priceMinor: "8350",
    minAmountMinor: "10000",
    maxAmountMinor: "300000",
    paymentMethod: "UPI",
    premiumPct: 1.2,
    merchant: DEMO_P2P_MERCHANTS[0],
    terms: "Release within 10 minutes after confirmed payment.",
  },
  {
    id: "demo-offer-2",
    type: "BUY",
    asset: "USDT",
    fiatCurrency: "INR",
    priceMinor: "8295",
    minAmountMinor: "5000",
    maxAmountMinor: "250000",
    paymentMethod: "Google Pay",
    premiumPct: 0.4,
    merchant: DEMO_P2P_MERCHANTS[1],
    terms: "UPI and GPay accepted. Include trade reference in remarks.",
  },
  {
    id: "demo-offer-3",
    type: "SELL",
    asset: "BTC",
    fiatCurrency: "USD",
    priceMinor: "6845000",
    minAmountMinor: "250000",
    maxAmountMinor: "1800000",
    paymentMethod: "Bank Transfer",
    premiumPct: 0.8,
    merchant: DEMO_P2P_MERCHANTS[2],
    terms: "Bank transfer only. KYC-verified accounts preferred.",
  },
  {
    id: "demo-offer-4",
    type: "SELL",
    asset: "ETH",
    fiatCurrency: "USD",
    priceMinor: "354200",
    minAmountMinor: "50000",
    maxAmountMinor: "900000",
    paymentMethod: "Paytm",
    premiumPct: 0.6,
    merchant: DEMO_P2P_MERCHANTS[3],
    terms: "Paytm verified merchants only. Release in under 15 minutes.",
  },
];

export const P2P_ASSET_OPTIONS = ["BTC", "USDT", "ETH"] as const;
export const P2P_CURRENCY_OPTIONS = ["USD", "INR"] as const;
export const P2P_PAYMENT_OPTIONS = ["Google Pay", "UPI", "Bank Transfer", "Paytm"] as const;
export const P2P_SORT_OPTIONS = [
  "best_price",
  "most_completed",
  "fastest_response",
  "recently_active",
] as const;

export type P2PSortOption = (typeof P2P_SORT_OPTIONS)[number];

export interface DashboardAssetBalance {
  asset: string;
  network: string;
  availableMinor: string;
  lockedMinor: string;
  changePct24h: number;
}

export interface DashboardActivityItem {
  id: string;
  type:
    | "DEPOSIT"
    | "WITHDRAWAL"
    | "TRADE_STARTED"
    | "PAYMENT_MARKED"
    | "TRADE_COMPLETED"
    | "ESCROW_RELEASED"
    | "OFFER_CREATED";
  title: string;
  createdAt: string;
}

export interface DashboardNotificationItem {
  id: string;
  level: "INFO" | "WARN" | "CRITICAL";
  title: string;
  message: string;
  createdAt: string;
}

export interface DashboardTradePreview {
  id: string;
  merchantName: string;
  side: "BUY" | "SELL";
  asset: string;
  amountMinor: string;
  fiatCurrency: string;
  paymentMethod: string;
  status: string;
}

export interface DashboardOfferPreview {
  id: string;
  side: "BUY" | "SELL";
  asset: string;
  fiatCurrency: string;
  priceMinor: string;
  paymentMethod: string;
  minAmountMinor: string;
  maxAmountMinor: string;
  status: string;
}

export const DEMO_DASHBOARD_ASSET_BALANCES: DashboardAssetBalance[] = [
  { asset: "USDT", network: "TRC20", availableMinor: "480000", lockedMinor: "20000", changePct24h: 0.2 },
  { asset: "BTC", network: "BTC", availableMinor: "720000", lockedMinor: "30000", changePct24h: 1.6 },
  { asset: "ETH", network: "ERC20", availableMinor: "210000", lockedMinor: "14000", changePct24h: -0.7 },
];

export const DEMO_DASHBOARD_ACTIVITY: DashboardActivityItem[] = [
  {
    id: "da1",
    type: "TRADE_STARTED",
    title: "Trade started with GreenDesk Capital",
    createdAt: new Date(Date.now() - 1000 * 60 * 8).toISOString(),
  },
  {
    id: "da2",
    type: "PAYMENT_MARKED",
    title: "Payment marked as sent for trade #TRD-2045",
    createdAt: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
  },
  {
    id: "da3",
    type: "WITHDRAWAL",
    title: "Withdrawal request submitted",
    createdAt: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
  },
  {
    id: "da4",
    type: "OFFER_CREATED",
    title: "New USDT sell offer created",
    createdAt: new Date(Date.now() - 1000 * 60 * 150).toISOString(),
  },
];

export const DEMO_DASHBOARD_NOTIFICATIONS: DashboardNotificationItem[] = [
  {
    id: "dn1",
    level: "WARN",
    title: "Trade awaiting confirmation",
    message: "Trade #MXT-204 is awaiting your confirmation.",
    createdAt: new Date(Date.now() - 1000 * 60 * 3).toISOString(),
  },
  {
    id: "dn2",
    level: "INFO",
    title: "Wallet review",
    message: "Wallet deposit pending review in demo workflow.",
    createdAt: new Date(Date.now() - 1000 * 60 * 40).toISOString(),
  },
  {
    id: "dn3",
    level: "CRITICAL",
    title: "Security reminder",
    message: "Never release crypto outside verified payment confirmation.",
    createdAt: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
  },
];

export const DEMO_DASHBOARD_TRADES: DashboardTradePreview[] = [
  {
    id: "demo-trade-1",
    merchantName: "GreenDesk Capital",
    side: "BUY",
    asset: "USDT",
    amountMinor: "125000",
    fiatCurrency: "INR",
    paymentMethod: "UPI",
    status: "PAYMENT_PENDING",
  },
  {
    id: "demo-trade-2",
    merchantName: "Atlas OTC",
    side: "SELL",
    asset: "USDT",
    amountMinor: "86000",
    fiatCurrency: "INR",
    paymentMethod: "Google Pay",
    status: "PAYMENT_SENT",
  },
  {
    id: "demo-trade-3",
    merchantName: "Malachite Ambassador",
    side: "BUY",
    asset: "BTC",
    amountMinor: "320000",
    fiatCurrency: "USD",
    paymentMethod: "Bank Transfer",
    status: "COMPLETED",
  },
];

export const DEMO_DASHBOARD_OFFERS: DashboardOfferPreview[] = [
  {
    id: "demo-offer-1",
    side: "SELL",
    asset: "USDT",
    fiatCurrency: "INR",
    priceMinor: "8350",
    paymentMethod: "UPI",
    minAmountMinor: "10000",
    maxAmountMinor: "300000",
    status: "ACTIVE",
  },
  {
    id: "demo-offer-2",
    side: "BUY",
    asset: "USDT",
    fiatCurrency: "INR",
    priceMinor: "8295",
    paymentMethod: "Google Pay",
    minAmountMinor: "5000",
    maxAmountMinor: "250000",
    status: "ACTIVE",
  },
];
