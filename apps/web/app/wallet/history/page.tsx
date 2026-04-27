"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Clock3, Filter } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { tokenStore } from "@/lib/api";
import { friendlyErrorMessage } from "@/lib/errors";
import { formatDateTime, formatMinorUnits } from "@/lib/money";
import {
  walletService,
  type DepositRecord,
  type WalletLedgerItem,
  type WalletSummary,
  type WithdrawalRecord,
} from "@/services/wallet.service";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingState } from "@/components/ui/loading-state";

type HistoryFilter = "ALL" | "LEDGER" | "DEPOSIT" | "WITHDRAW";

interface UnifiedHistoryItem {
  id: string;
  source: "LEDGER" | "DEPOSIT" | "WITHDRAW";
  type: string;
  amountMinor: string;
  status?: string;
  createdAt: string;
  detail?: string;
}

function buildHistory(
  ledger: WalletLedgerItem[],
  deposits: DepositRecord[],
  withdrawals: WithdrawalRecord[],
): UnifiedHistoryItem[] {
  const ledgerRows: UnifiedHistoryItem[] = ledger.map((item) => ({
    id: `ledger-${item.id}`,
    source: "LEDGER",
    type: item.type,
    amountMinor: item.amountMinor,
    createdAt: item.createdAt,
  }));

  const depositRows: UnifiedHistoryItem[] = deposits.map((item) => ({
    id: `deposit-${item.id}`,
    source: "DEPOSIT",
    type: "DEPOSIT",
    amountMinor: item.amountMinor,
    status: item.status,
    createdAt: item.createdAt,
    detail: item.txRef,
  }));

  const withdrawalRows: UnifiedHistoryItem[] = withdrawals.map((item) => ({
    id: `withdraw-${item.id}`,
    source: "WITHDRAW",
    type: "WITHDRAWAL",
    amountMinor: item.amountMinor.startsWith("-") ? item.amountMinor : `-${item.amountMinor}`,
    status: item.status,
    createdAt: item.createdAt,
    detail: item.destination,
  }));

  return [...ledgerRows, ...depositRows, ...withdrawalRows].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

function statusBadge(status?: string) {
  const normalized = (status ?? "").toUpperCase();

  if (normalized.includes("APPROVED") || normalized.includes("CONFIRMED")) {
    return "border-emerald-700/50 bg-emerald-950/40 text-emerald-200";
  }
  if (normalized.includes("PENDING")) {
    return "border-amber-700/50 bg-amber-950/40 text-amber-200";
  }
  if (normalized.includes("REJECTED")) {
    return "border-red-700/50 bg-red-950/40 text-red-200";
  }
  return "border-zinc-700/60 bg-zinc-900/60 text-slate-300";
}

export default function WalletHistoryPage() {
  const { isAuthenticated, isBootstrapping } = useAuth();
  const [currency, setCurrency] = useState("INR");
  const [history, setHistory] = useState<UnifiedHistoryItem[]>([]);
  const [filter, setFilter] = useState<HistoryFilter>("ALL");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isBootstrapping) return;
    if (!isAuthenticated) {
      setCurrency("INR");
      setHistory([]);
      setError(null);
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const token = tokenStore.accessToken ?? undefined;

        const [wallet, deposits, withdrawals] = await Promise.all([
          walletService.getWallet(token),
          walletService.listDeposits(token),
          walletService.listWithdrawals(token),
        ]);
        setCurrency(wallet.currency);
        setHistory(buildHistory(wallet.ledger, deposits, withdrawals));
        setError(null);
      } catch (err) {
        setCurrency("INR");
        setHistory([]);
        setError(friendlyErrorMessage(err, "Live wallet history is temporarily unavailable."));
      } finally {
        setLoading(false);
      }
    })();
  }, [isAuthenticated, isBootstrapping]);

  const filteredHistory = useMemo(() => {
    if (filter === "ALL") return history;
    return history.filter((item) => item.source === filter);
  }, [history, filter]);

  if (isBootstrapping) {
    return <LoadingState label="Loading wallet history workspace" />;
  }

  if (!isAuthenticated) {
    return (
      <section className="space-y-3">
        <h1 className="text-2xl font-semibold text-white">Wallet History</h1>
        <p className="text-sm text-slate-400">Your session is not active. Please log in to open wallet history.</p>
        <Link href="/login?next=/wallet/history">
          <Button>Go to login</Button>
        </Link>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.2em] text-emerald-300">Wallet / History</p>
        <h1 className="text-3xl font-semibold text-white">Wallet History</h1>
        <p className="text-sm text-slate-400">Unified timeline of ledger, deposit, and withdrawal events.</p>
      </header>

      {error ? (
        <Card className="border-amber-500/30 bg-amber-950/20">
          <CardContent className="pt-6">
            <p className="text-sm text-amber-200">Live history is currently unavailable.</p>
            <p className="mt-1 text-xs text-amber-300/80">{error}</p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Filter className="h-5 w-5 text-emerald-300" />
            Activity Filters
          </CardTitle>
          <CardDescription>Refine records by source type</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {(["ALL", "LEDGER", "DEPOSIT", "WITHDRAW"] as HistoryFilter[]).map((entry) => (
            <Button
              key={entry}
              variant={filter === entry ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(entry)}
            >
              {entry}
            </Button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Timeline</CardTitle>
          <CardDescription>Most recent records appear first</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-xs uppercase tracking-wide text-slate-400">
                <th className="px-2 py-3">Source</th>
                <th className="px-2 py-3">Type</th>
                <th className="px-2 py-3">Amount</th>
                <th className="px-2 py-3">Status</th>
                <th className="px-2 py-3">Details</th>
                <th className="px-2 py-3">Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {filteredHistory.map((item) => (
                <tr key={item.id} className="border-b border-zinc-900/80 text-slate-200">
                  <td className="px-2 py-3">{item.source}</td>
                  <td className="px-2 py-3">{item.type}</td>
                  <td className={`px-2 py-3 ${item.amountMinor.startsWith("-") ? "text-red-300" : "text-emerald-300"}`}>
                    {formatMinorUnits(item.amountMinor, currency)}
                  </td>
                  <td className="px-2 py-3">
                    {item.status ? (
                      <span className={`inline-flex rounded-full border px-2 py-1 text-xs ${statusBadge(item.status)}`}>
                        {item.status}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-500">-</span>
                    )}
                  </td>
                  <td className="px-2 py-3 text-xs text-slate-400">{item.detail ?? "-"}</td>
                  <td className="px-2 py-3 text-xs text-slate-400">{formatDateTime(item.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {!loading && filteredHistory.length === 0 ? (
            <p className="mt-4 rounded-xl border border-dashed border-zinc-700 px-3 py-4 text-sm text-slate-500">
              No records available for this filter.
            </p>
          ) : null}
          {loading ? (
            <p className="mt-4 flex items-center gap-1 text-xs text-slate-500">
              <Clock3 className="h-3.5 w-3.5" />
              Loading history...
            </p>
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
}
