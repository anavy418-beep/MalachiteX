"use client";

import { FormEvent, useEffect, useState } from "react";
import { ArrowDownToLine, CheckCircle2, Clock3 } from "lucide-react";
import { tokenStore } from "@/lib/api";
import { formatDateTime, formatMinorUnits } from "@/lib/money";
import { walletService, type DepositRecord } from "@/services/wallet.service";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const DEMO_DEPOSITS: DepositRecord[] = [
  { id: "d1", amountMinor: "500000", txRef: "MX-DEMO-9182", status: "CONFIRMED", createdAt: new Date().toISOString() },
  { id: "d2", amountMinor: "300000", txRef: "MX-DEMO-9150", status: "PENDING", createdAt: new Date().toISOString() },
];

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
  const [records, setRecords] = useState<DepositRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  async function loadRecords() {
    const token = tokenStore.accessToken;

    if (!token) {
      setRecords(DEMO_DEPOSITS);
      setError("Session token missing. Showing demo deposit data.");
      setLoading(false);
      return;
    }

    try {
      const payload = await walletService.listDeposits(token);
      setRecords(payload);
      setError(null);
    } catch (err) {
      setRecords(DEMO_DEPOSITS);
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRecords();
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    const token = tokenStore.accessToken;
    if (!token) {
      setError("Login required for live deposit submission.");
      return;
    }

    const formData = new FormData(event.currentTarget);
    const amountMinor = String(formData.get("amountMinor") ?? "");
    const txRef = String(formData.get("txRef") ?? "");

    setSubmitting(true);
    try {
      await walletService.mockDeposit(token, { amountMinor, txRef });
      setSuccess("Mock deposit confirmed successfully.");
      (event.currentTarget as HTMLFormElement).reset();
      await loadRecords();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.2em] text-emerald-300">Wallet / Deposit</p>
        <h1 className="text-3xl font-semibold text-white">Deposit Funds</h1>
        <p className="text-sm text-slate-400">Demo-safe deposit confirmation flow for staging previews.</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ArrowDownToLine className="h-5 w-5 text-emerald-300" />
            Confirm Mock Deposit
          </CardTitle>
          <CardDescription>
            This MVP uses a simulated confirmation flow and does not interact with real blockchain rails.
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
        Demo flow is active and safe for staging environments.
      </p>
    </section>
  );
}
