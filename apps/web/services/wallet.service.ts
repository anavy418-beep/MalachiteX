import { apiRequest } from "@/lib/api";

export interface WalletLedgerItem {
  id: string;
  type: string;
  amountMinor: string;
  createdAt: string;
}

export interface WalletSummary {
  currency: string;
  availableBalanceMinor: string;
  escrowBalanceMinor: string;
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
  getWallet(token: string) {
    return apiRequest<WalletSummary>("/wallet", { token });
  },

  listDeposits(token: string) {
    return apiRequest<DepositRecord[]>("/wallet/deposits", { token });
  },

  listWithdrawals(token: string) {
    return apiRequest<WithdrawalRecord[]>("/wallet/withdrawals", { token });
  },

  mockDeposit(token: string, input: { amountMinor: string; txRef: string }) {
    return apiRequest("/wallet/mock-deposit", {
      method: "POST",
      token,
      body: JSON.stringify(input),
    });
  },

  requestWithdrawal(token: string, input: { amountMinor: string; destination: string }) {
    return apiRequest("/wallet/withdrawals", {
      method: "POST",
      token,
      body: JSON.stringify(input),
    });
  },
};
