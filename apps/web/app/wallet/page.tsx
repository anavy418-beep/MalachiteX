"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, Clock3, History, WalletCards } from "lucide-react";
import { tokenStore } from "@/lib/api";
import { formatDateTime, formatMinorUnits } from "@/lib/money";
import { walletService, type WalletSummary } from "@/services/wallet.service";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const DEMO_WALLET: WalletSummary = {
  currency: "INR",
  availableBalanceMinor: "2450000",
  escrowBalanceMinor: "375000",
  ledger: [
    { id: "l1", type: "DEPOSIT", amountMinor: "1200000", createdAt: new Date().toISOString() },
    { id: "l2", type: "WITHDRAWAL_REQUEST", amountMinor: "-350000", createdAt: new Date().toISOString() },
    { id: "l3", type: "TRADE_ESCROW_HOLD", amountMinor: "-125000", createdAt: new Date().toISOString() },
  ],
};

export default function WalletPage() {
  const [wallet, setWallet] = useState<WalletSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDemo, setIsDemo] = useState(false);

  useEffect(() => {
    (async () => {
      const token = tokenStore.accessToken;
      if (!token) {
        setWallet(DEMO_WALLET);
        setIsDemo(true);
        setError("Session token missing. Showing demo wallet preview.");
        setLoading(false);
        return;
      }

      try {
        const payload = await walletService.getWallet(token);
        setWallet(payload);
      } catch (err) {
        setWallet(DEMO_WALLET);
        setIsDemo(true);
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const current = wallet ?? DEMO_WALLET;
  const available = BigInt(current.availableBalanceMinor || "0");
  const escrow = BigInt(current.escrowBalanceMinor || "0");
  const total = available + escrow;

  const assetRows = useMemo(
    () => [
      {
        asset: current.currency,
        balanceMinor: total.toString(),
        availableMinor: available.toString(),
        lockedMinor: escrow.toString(),
      },
      // TODO(step-9): Replace with multi-asset wallet endpoint when available.
      { asset: "USDT", balanceMinor: "530000", availableMinor: "500000", lockedMinor: "30000" },
      { asset: "BTC", balanceMinor: "750000", availableMinor: "700000", lockedMinor: "50000" },
    ],
    [current.currency, total, available, escrow],
  );

  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.2em] text-emerald-300">Malachitex Wallet</p>
        <h1 className="text-3xl font-semibold text-white">Wallet Overview</h1>
        <p className="text-sm text-slate-400">Portfolio balances, quick actions, and ledger visibility.</p>
      </header>

      {error ? (
        <Card className="border-amber-500/30 bg-amber-950/20">
          <CardContent className="pt-6">
            <p className="text-sm text-amber-200">
              Live wallet data is unavailable. Showing safe demo data for preview.
            </p>
            <p className="mt-1 text-xs text-amber-300/80">{error}</p>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Balance</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-white">{formatMinorUnits(total.toString(), current.currency)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Available Balance</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-emerald-300">
              {formatMinorUnits(available.toString(), current.currency)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Locked Balance</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-lime-300">{formatMinorUnits(escrow.toString(), current.currency)}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Quick Actions</CardTitle>
          <CardDescription>Wallet operations for demo flow</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Link href="/wallet/deposit">
            <Button className="gap-2">
              <ArrowDownToLine className="h-4 w-4" />
              Deposit
            </Button>
          </Link>
          <Link href="/wallet/withdraw">
            <Button variant="secondary" className="gap-2">
              <ArrowUpFromLine className="h-4 w-4" />
              Withdraw
            </Button>
          </Link>
          <Link href="/wallet/history">
            <Button variant="outline" className="gap-2">
              <History className="h-4 w-4" />
              Wallet History
            </Button>
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Asset Balances</CardTitle>
          <CardDescription>Summary table for major wallet assets</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-xs uppercase tracking-wide text-slate-400">
                <th className="px-2 py-3">Asset</th>
                <th className="px-2 py-3">Total</th>
                <th className="px-2 py-3">Available</th>
                <th className="px-2 py-3">Locked</th>
              </tr>
            </thead>
            <tbody>
              {assetRows.map((asset) => (
                <tr key={asset.asset} className="border-b border-zinc-900/80 text-slate-200">
                  <td className="px-2 py-3 font-medium">{asset.asset}</td>
                  <td className="px-2 py-3">{formatMinorUnits(asset.balanceMinor, asset.asset)}</td>
                  <td className="px-2 py-3 text-emerald-300">{formatMinorUnits(asset.availableMinor, asset.asset)}</td>
                  <td className="px-2 py-3 text-lime-300">{formatMinorUnits(asset.lockedMinor, asset.asset)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent Ledger Activity</CardTitle>
          <CardDescription>Latest entries from wallet ledger</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {current.ledger.slice(0, 6).map((entry) => (
            <article key={entry.id} className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-slate-100">{entry.type}</p>
                <p className={`text-sm ${entry.amountMinor.startsWith("-") ? "text-red-300" : "text-emerald-300"}`}>
                  {formatMinorUnits(entry.amountMinor, current.currency)}
                </p>
              </div>
              <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                <Clock3 className="h-3.5 w-3.5" />
                {formatDateTime(entry.createdAt)}
              </p>
            </article>
          ))}
          {current.ledger.length === 0 ? (
            <p className="rounded-xl border border-dashed border-zinc-700 px-3 py-4 text-sm text-slate-500">
              No ledger entries yet.
            </p>
          ) : null}
        </CardContent>
      </Card>

      {loading ? <p className="text-xs text-slate-500">Refreshing wallet data...</p> : null}
      {isDemo ? <p className="text-xs text-amber-300/80">Demo mode enabled for wallet preview.</p> : null}
    </section>
  );
}
