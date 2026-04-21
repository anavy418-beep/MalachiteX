"use client";

import { FormEvent, useEffect, useState } from "react";
import { ArrowUpFromLine, Clock3 } from "lucide-react";
import { tokenStore } from "@/lib/api";
import { friendlyErrorMessage } from "@/lib/errors";
import { DEMO_WITHDRAWALS } from "@/lib/demo-data";
import { formatDateTime, formatMinorUnits } from "@/lib/money";
import { walletService, type WithdrawalRecord } from "@/services/wallet.service";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

function statusBadge(status: string) {
  const normalized = status.toUpperCase();

  if (normalized.includes("APPROVED")) {
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

export default function WalletWithdrawPage() {
  const [records, setRecords] = useState<WithdrawalRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [isDemo, setIsDemo] = useState(false);

  async function loadRecords() {
    const token = tokenStore.accessToken;

    if (!token) {
      setRecords(DEMO_WITHDRAWALS);
      setIsDemo(true);
      setError("Showing demo withdrawal records. Use Try Demo to test an authenticated request.");
      setLoading(false);
      return;
    }

    try {
      const payload = await walletService.listWithdrawals(token);
      if (payload.length === 0) {
        setRecords(DEMO_WITHDRAWALS);
        setIsDemo(true);
      } else {
        setRecords(payload);
        setIsDemo(false);
      }
      setError(null);
    } catch (err) {
      setRecords(DEMO_WITHDRAWALS);
      setIsDemo(true);
      setError(friendlyErrorMessage(err, "Live withdrawal history is temporarily unavailable."));
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
      setError("Login required for live withdrawal submission.");
      return;
    }

    const formData = new FormData(event.currentTarget);
    const amountMinor = String(formData.get("amountMinor") ?? "");
    const destination = String(formData.get("destination") ?? "");

    setSubmitting(true);
    try {
      await walletService.requestWithdrawal(token, { amountMinor, destination });
      setSuccess("Withdrawal request submitted.");
      (event.currentTarget as HTMLFormElement).reset();
      await loadRecords();
    } catch (err) {
      setError(friendlyErrorMessage(err, "Unable to submit this withdrawal request."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.2em] text-emerald-300">Wallet / Withdraw</p>
        <h1 className="text-3xl font-semibold text-white">Withdraw Funds</h1>
        <p className="text-sm text-slate-400">Submit staged withdrawal requests with approval workflow preview.</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ArrowUpFromLine className="h-5 w-5 text-lime-300" />
            New Withdrawal Request
          </CardTitle>
          <CardDescription>
            Requests are reviewed by admin in this MVP. No real payout rail integration is active.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-[1fr_1fr_auto]" onSubmit={onSubmit}>
            <div className="space-y-1.5">
              <Label htmlFor="amountMinor">Amount (minor units)</Label>
              <Input id="amountMinor" name="amountMinor" type="number" required placeholder="250000" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="destination">Destination</Label>
              <Input id="destination" name="destination" required placeholder="UPI / bank / wallet address" />
            </div>
            <div className="flex items-end">
              <Button type="submit" className="w-full md:w-auto" disabled={submitting}>
                {submitting ? "Submitting..." : "Submit request"}
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
          <CardTitle className="text-lg">Withdrawal Requests</CardTitle>
          <CardDescription>Track request status from pending to final decision</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-xs uppercase tracking-wide text-slate-400">
                <th className="px-2 py-3">Destination</th>
                <th className="px-2 py-3">Amount</th>
                <th className="px-2 py-3">Status</th>
                <th className="px-2 py-3">Created</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr key={record.id} className="border-b border-zinc-900/80 text-slate-200">
                  <td className="px-2 py-3">{record.destination}</td>
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
              No withdrawal requests yet.
            </p>
          ) : null}
          {loading ? (
            <p className="mt-4 flex items-center gap-1 text-xs text-slate-500">
              <Clock3 className="h-3.5 w-3.5" />
              Loading withdrawal records...
            </p>
          ) : null}
        </CardContent>
      </Card>
      {isDemo ? (
        <p className="text-xs text-amber-300/80">Showing demo withdrawal records for staging walkthrough.</p>
      ) : null}
    </section>
  );
}
