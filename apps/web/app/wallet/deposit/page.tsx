"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { ArrowDownToLine, CheckCircle2, Clock3, QrCode } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { tokenStore } from "@/lib/api";
import { friendlyErrorMessage } from "@/lib/errors";
import { formatDateTime, formatMinorUnits } from "@/lib/money";
import {
  getWalletNetworkLabel,
  resolveWalletIdentity,
  type WalletNetwork,
} from "@/lib/wallet-identity";
import { walletService, type DepositRecord, type WalletSummary } from "@/services/wallet.service";
import { AddressQrModal } from "@/components/wallet/address-qr-modal";
import { CopyableValueRow } from "@/components/wallet/copyable-value-row";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingState } from "@/components/ui/loading-state";

const NETWORKS: WalletNetwork[] = ["ERC20", "TRC20", "BTC"];
const EMPTY_WALLET_SUMMARY: WalletSummary = {
  currency: "INR",
  availableBalanceMinor: "0",
  escrowBalanceMinor: "0",
  ledger: [],
};

function statusBadge(status: string) {
  const normalized = status.toUpperCase();

  if (normalized.includes("CONFIRMED") || normalized.includes("SUCCESS")) {
    return "border-emerald-700/50 bg-emerald-950/40 text-emerald-200";
  }

  if (normalized.includes("PENDING")) {
    return "border-amber-700/50 bg-amber-950/40 text-amber-200";
  }

  return "border-zinc-700/60 bg-zinc-900/60 text-slate-300";
}

export default function WalletDepositPage() {
  const { isAuthenticated, isBootstrapping } = useAuth();
  const [records, setRecords] = useState<DepositRecord[]>([]);
  const [wallet, setWallet] = useState<WalletSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selectedNetwork, setSelectedNetwork] = useState<WalletNetwork>("ERC20");
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);

  async function loadRecords() {
    try {
      const token = tokenStore.accessToken ?? undefined;

      const [payload, walletPayload] = await Promise.all([
        walletService.listDeposits(token),
        walletService.getWallet(token),
      ]);

      setWallet(walletPayload);
      setRecords(payload);
      setError(null);
    } catch (err) {
      setRecords([]);
      setWallet(null);
      setError(friendlyErrorMessage(err, "Live deposit history is temporarily unavailable."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isBootstrapping) return;
    if (!isAuthenticated) {
      setLoading(false);
      setRecords([]);
      setWallet(null);
      return;
    }
    void loadRecords();
  }, [isAuthenticated, isBootstrapping]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (!isAuthenticated) {
      setError("Login required for live deposit submission.");
      return;
    }

    const formData = new FormData(event.currentTarget);
    const amountMinor = String(formData.get("amountMinor") ?? "");
    const txRef = String(formData.get("txRef") ?? "");
    const token = tokenStore.accessToken ?? undefined;

    setSubmitting(true);
    try {
      await walletService.mockDeposit(token, { amountMinor, txRef });
      setSuccess("Deposit confirmed successfully.");
      (event.currentTarget as HTMLFormElement).reset();
      await loadRecords();
    } catch (err) {
      setError(friendlyErrorMessage(err, "Unable to submit this deposit confirmation."));
    } finally {
      setSubmitting(false);
    }
  }

  const currentWallet = wallet ?? EMPTY_WALLET_SUMMARY;
  const selectedAsset = selectedNetwork === "BTC" ? "BTC" : "USDT";
  const identity = resolveWalletIdentity({
    walletId: currentWallet.walletId,
    currency: currentWallet.currency,
    depositAddresses: currentWallet.depositAddresses,
    seedHint: "malachitex:wallet:deposit",
    selectedNetwork,
  });
  const activeAddress = identity.addresses[selectedNetwork];

  async function copyText(value: string, field: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      setTimeout(() => setCopiedField((prev) => (prev === field ? null : prev)), 1600);
    } catch {
      setError("Clipboard copy failed. Please copy manually.");
    }
  }

  if (isBootstrapping) {
    return <LoadingState label="Loading wallet deposit workspace" />;
  }

  if (!isAuthenticated) {
    return (
      <section className="space-y-3">
        <h1 className="text-2xl font-semibold text-white">Wallet Deposit</h1>
        <p className="text-sm text-slate-400">Your session is not active. Please log in to open deposit controls.</p>
        <Link href="/login?next=/wallet/deposit">
          <Button>Go to login</Button>
        </Link>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.2em] text-emerald-300">Wallet / Deposit</p>
        <h1 className="text-3xl font-semibold text-white">Deposit Funds</h1>
        <p className="text-sm text-slate-400">Confirm incoming funds to credit your wallet balance and ledger.</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Deposit Coordinates</CardTitle>
          <CardDescription>Use matching network and address for reliable crediting.</CardDescription>
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

            <div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs uppercase tracking-wide text-slate-400">Deposit Address</p>
                <span className="rounded-full border border-emerald-700/40 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-200">
                  {selectedAsset} - {getWalletNetworkLabel(selectedNetwork)}
                </span>
              </div>
              <CopyableValueRow
                className="flex flex-wrap items-center justify-between gap-3"
                value={activeAddress}
                copied={copiedField === "deposit-address"}
                onCopy={() => void copyText(activeAddress, "deposit-address")}
              />
              <Button size="sm" className="w-fit gap-1.5" onClick={() => setShowQr(true)}>
                <QrCode className="h-3.5 w-3.5" />
                Show QR
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ArrowDownToLine className="h-5 w-5 text-emerald-300" />
            Confirm Deposit
          </CardTitle>
          <CardDescription>
            Confirmed deposits are persisted and immediately reflected in wallet available balance.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-[1fr_1fr_auto]" onSubmit={onSubmit}>
            <div className="space-y-1.5">
              <Label htmlFor="amountMinor">Amount (minor units)</Label>
              <Input id="amountMinor" name="amountMinor" type="number" required placeholder="500000" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="txRef">Transaction reference</Label>
              <Input id="txRef" name="txRef" required placeholder="MX-DEMO-9123" />
            </div>
            <div className="flex items-end">
              <Button type="submit" className="w-full md:w-auto" disabled={submitting}>
                {submitting ? "Submitting..." : "Confirm deposit"}
              </Button>
            </div>
          </form>
          <div className="mt-4 space-y-2">
            {error ? <Alert variant="error">{error}</Alert> : null}
            {success ? <Alert variant="success">{success}</Alert> : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Deposit History</CardTitle>
          <CardDescription>Latest deposit records and status updates</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-xs uppercase tracking-wide text-slate-400">
                <th className="px-2 py-3">Reference</th>
                <th className="px-2 py-3">Amount</th>
                <th className="px-2 py-3">Status</th>
                <th className="px-2 py-3">Created</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr key={record.id} className="border-b border-zinc-900/80 text-slate-200">
                  <td className="px-2 py-3 font-mono text-xs">{record.txRef}</td>
                  <td className="px-2 py-3">{formatMinorUnits(record.amountMinor, "INR")}</td>
                  <td className="px-2 py-3">
                    <span className={`inline-flex rounded-full border px-2 py-1 text-xs ${statusBadge(record.status)}`}>
                      {record.status}
                    </span>
                  </td>
                  <td className="px-2 py-3 text-xs text-slate-400">{formatDateTime(record.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {!loading && records.length === 0 ? (
            <p className="mt-4 rounded-xl border border-dashed border-zinc-700 px-3 py-4 text-sm text-slate-500">
              No deposit records yet.
            </p>
          ) : null}
          {loading ? (
            <p className="mt-4 flex items-center gap-1 text-xs text-slate-500">
              <Clock3 className="h-3.5 w-3.5" />
              Loading deposit records...
            </p>
          ) : null}
        </CardContent>
      </Card>

      <p className="inline-flex items-center gap-1 text-xs text-emerald-300/90">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Deposits are persisted in your wallet ledger and reflected in balance history.
      </p>

      <AddressQrModal
        open={showQr}
        onClose={() => setShowQr(false)}
        address={activeAddress}
        networkLabel={getWalletNetworkLabel(selectedNetwork)}
      />
    </section>
  );
}

