export type UserRole = "USER" | "ADMIN";

export type OfferType = "BUY" | "SELL";
export type OfferStatus = "ACTIVE" | "PAUSED" | "CLOSED";

export type TradeStatus =
  | "PENDING_PAYMENT"
  | "PAID"
  | "RELEASED"
  | "CANCELED"
  | "DISPUTED";

export interface JwtPayload {
  sub: string;
  role: UserRole;
  email: string;
}

export interface MoneyAmount {
  currency: string;
  amountMinor: string;
}

export interface WalletSnapshot {
  availableBalanceMinor: string;
  escrowBalanceMinor: string;
  currency: string;
}

export interface ApiResponse<T> {
  data: T;
  message?: string;
}
