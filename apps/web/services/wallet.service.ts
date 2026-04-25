import { apiRequest } from "@/lib/api";

export interface WalletLedgerItem {
  id: string;
  type: string;
  amountMinor: string;
  createdAt: string;
}

export interface WalletDepositAddresses {
  BTC?: string;
  ERC20?: string;
  TRC20?: string;
}

export interface WalletSummary {
  currency: string;
  availableBalanceMinor: string;
  escrowBalanceMinor: string;
  walletId?: string;
  depositAddresses?: WalletDepositAddresses;
  ledger: WalletLedgerItem[];
}

export interface DepositRecord {
  id: string;
  amountMinor: string;
  txRef: string;
  status: string;
  createdAt: string;
}

export interface WithdrawalRecord {
  id: string;
  amountMinor: string;
  destination: string;
  status: string;
  createdAt: string;
}

export const walletService = {
  getWallet(token: string | undefined) {
    return apiRequest<WalletSummary>("/wallet", { token });
  },

  listDeposits(token: string | undefined) {
    return apiRequest<DepositRecord[]>("/wallet/deposits", { token });
  },

  listWithdrawals(token: string | undefined) {
    return apiRequest<WithdrawalRecord[]>("/wallet/withdrawals", { token });
  },

  mockDeposit(token: string | undefined, input: { amountMinor: string; txRef: string }) {
    return apiRequest("/wallet/mock-deposit", {
      method: "POST",
      token,
      body: JSON.stringify(input),
    });
  },

  requestWithdrawal(token: string | undefined, input: { amountMinor: string; destination: string }) {
    return apiRequest("/wallet/withdrawals", {
      method: "POST",
      token,
      body: JSON.stringify(input),
    });
  },
};
