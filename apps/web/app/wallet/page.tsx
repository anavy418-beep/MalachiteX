"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, Clock3, History, QrCode } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { tokenStore } from "@/lib/api";
import { DEMO_WALLET_SUMMARY } from "@/lib/demo-data";
import { formatDateTime, formatMinorUnits } from "@/lib/money";
import {
  getWalletNetworkLabel,
  resolveWalletIdentity,
  type WalletNetwork,
} from "@/lib/wallet-identity";
import { walletService, type WalletSummary } from "@/services/wallet.service";
import { AddressQrModal } from "@/components/wallet/address-qr-modal";
import { CopyableValueRow } from "@/components/wallet/copyable-value-row";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingState } from "@/components/ui/loading-state";

const NETWORKS: WalletNetwork[] = ["ERC20", "TRC20", "BTC"];

export default function WalletPage() {
  const { isAuthenticated, isBootstrapping } = useAuth();
  const [wallet, setWallet] = useState<WalletSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [selectedNetwork, setSelectedNetwork] = useState<WalletNetwork>("ERC20");

  useEffect(() => {
    if (isBootstrapping) {
      return;
    }

    if (!isAuthenticated) {
      setWallet(null);
      setError(null);
      setIsDemo(false);
      setLoading(false);
      return;
    }

    let active = true;

    const loadWallet = async () => {
      setLoading(true);
      const token = tokenStore.accessToken;
      if (!token) {
        if (!active) return;
        setWallet(DEMO_WALLET_SUMMARY);
        setIsDemo(true);
        setError("Live wallet session is syncing. Showing your wallet preview until session access is ready.");
        setLoading(false);
        return;
      }

      try {
        const payload = await walletService.getWallet(token);
        if (!active) return;
        const hasLiveBalance =
          BigInt(payload.availableBalanceMinor || "0") > 0n || BigInt(payload.escrowBalanceMinor || "0") > 0n;

        if (payload.ledger.length === 0 && !hasLiveBalance) {
          setWallet(DEMO_WALLET_SUMMARY);
          setIsDemo(true);
        } else {
          setWallet(payload);
        }
      } catch (err) {
        if (!active) return;
        setWallet(DEMO_WALLET_SUMMARY);
        setIsDemo(true);
        setError((err as Error).message);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void loadWallet();

    return () => {
      active = false;
    };
  }, [isAuthenticated, isBootstrapping]);

  const current = wallet ?? DEMO_WALLET_SUMMARY;
  const available = BigInt(current.availableBalanceMinor || "0");
  const escrow = BigInt(current.escrowBalanceMinor || "0");
  const total = available + escrow;
  const selectedAsset = selectedNetwork === "BTC" ? "BTC" : "USDT";
  const identity = resolveWalletIdentity({
    walletId: current.walletId,
    currency: current.currency,
    depositAddresses: current.depositAddresses,
    seedHint: "malachitex:wallet:primary",
    selectedNetwork,
  });
  const activeAddress = identity.addresses[selectedNetwork];

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

  async function copyText(value: string, field: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      setTimeout(() => setCopiedField((prev) => (prev === field ? null : prev)), 1800);
    } catch {
      setError("Clipboard copy failed. Please copy manually.");
    }
  }

  if (isBootstrapping) {
    return <LoadingState label="Loading wallet workspace" />;
  }

  if (!isAuthenticated) {
    return (
      <section className="space-y-3">
        <h1 className="text-2xl font-semibold text-white">Wallet</h1>
        <p className="text-sm text-slate-400">Your session is not active. Please log in to open wallet controls.</p>
        <Link href="/login">
          <Button>Go to login</Button>
        </Link>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.2em] text-emerald-300">MalachiteX Wallet</p>
        <h1 className="text-3xl font-semibold text-white">Wallet Overview</h1>
        <p className="text-sm text-slate-400">Portfolio balances, deposit identity, and ledger visibility.</p>
      </header>

      {error ? (
        <Card className="border-amber-500/30 bg-amber-950/20">
          <CardContent className="pt-6">
            <p className="text-sm text-amber-200">
              Live wallet data is unavailable. Showing stable demo wallet data.
            </p>
            <p className="mt-1 text-xs text-amber-300/80">{error}</p>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr_1fr]">
        <Card className="border-emerald-800/40 bg-gradient-to-br from-emerald-950/40 via-zinc-950 to-zinc-900">
          <CardHeader className="pb-2">
            <CardDescription>Total Portfolio Value</CardDescription>
            <CardTitle className="text-3xl text-white">{formatMinorUnits(total.toString(), current.currency)}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm text-slate-300 sm:grid-cols-2">
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Available</p>
              <p className="mt-1 font-semibold text-emerald-300">
                {formatMinorUnits(available.toString(), current.currency)}
              </p>
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Escrow</p>
              <p className="mt-1 font-semibold text-lime-300">{formatMinorUnits(escrow.toString(), current.currency)}</p>
            </div>
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
            <CardDescription>Escrow Balance</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-lime-300">{formatMinorUnits(escrow.toString(), current.currency)}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Wallet Identity</CardTitle>
          <CardDescription>Deterministic wallet ID and deposit addresses for demo and live fallback.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-400">Wallet ID</p>
            <CopyableValueRow
              className="mt-1 flex items-center justify-between gap-3"
              value={identity.walletId}
              copied={copiedField === "wallet-id"}
              onCopy={() => void copyText(identity.walletId, "wallet-id")}
            />
          </div>

          <div className="grid gap-3 md:grid-cols-[220px_1fr]">
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wide text-slate-400">Network</p>
              <div className="grid gap-2">
                {NETWORKS.map((network) => (
                  <button
                    key={network}
                    onClick={() => setSelectedNetwork(network)}
                    className={`rounded-lg border px-3 py-2 text-left text-sm transition ${
                      selectedNetwork === network
                        ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-200"
                        : "border-zinc-700 bg-zinc-950 text-slate-300 hover:border-zinc-600"
                    }`}
                  >
                    {getWalletNetworkLabel(network)}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs uppercase tracking-wide text-slate-400">Deposit Address</p>
                <span className="rounded-full border border-emerald-700/40 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-200">
                  {selectedAsset} · {getWalletNetworkLabel(selectedNetwork)}
                </span>
              </div>
              <CopyableValueRow
                className="flex flex-wrap items-center justify-between gap-3"
                value={activeAddress}
                copied={copiedField === "deposit-address"}
                onCopy={() => void copyText(activeAddress, "deposit-address")}
              />
              <div className="flex flex-wrap gap-2">
                <Button size="sm" className="gap-1.5" onClick={() => setShowQr(true)}>
                  <QrCode className="h-3.5 w-3.5" />
                  Show QR
                </Button>
                <Link href="/wallet/deposit">
                  <Button size="sm" variant="outline" className="gap-1.5">
                    <ArrowDownToLine className="h-3.5 w-3.5" />
                    Open Deposit Page
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

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

      <AddressQrModal
        open={showQr}
        onClose={() => setShowQr(false)}
        address={activeAddress}
        networkLabel={getWalletNetworkLabel(selectedNetwork)}
      />
    </section>
  );
}

