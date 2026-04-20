"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { apiRequest, tokenStore } from "@/lib/api";

interface PendingWithdrawal {
  id: string;
  userId: string;
  amountMinor: string;
  destination: string;
}

interface AuditLog {
  id: string;
  action: string;
  entityType: string;
  createdAt: string;
}

interface AdminDispute {
  id: string;
  reason: string;
  evidenceKeys: string[];
  status: string;
  trade: {
    id: string;
    buyerId: string;
    sellerId: string;
    fiatTotalMinor: string;
    paymentInstructions?: {
      method?: string;
      receiverName?: string;
      upiId?: string | null;
      accountNumber?: string | null;
      ifsc?: string | null;
    } | null;
    paymentProof?: {
      paymentReference?: string | null;
      proofFileName?: string | null;
      proofUrl?: string | null;
    } | null;
  };
}

export default function AdminPage() {
  const [withdrawals, setWithdrawals] = useState<PendingWithdrawal[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [disputes, setDisputes] = useState<AdminDispute[]>([]);

  const token = tokenStore.accessToken;

  async function load() {
    if (!token) return;
    const [pending, audit, openDisputes] = await Promise.all([
      apiRequest<PendingWithdrawal[]>("/admin/withdrawals/pending", { token }),
      apiRequest<AuditLog[]>("/admin/audit-logs", { token }),
      apiRequest<AdminDispute[]>("/admin/disputes/open", { token }),
    ]);
    setWithdrawals(pending);
    setLogs(audit);
    setDisputes(openDisputes);
  }

  useEffect(() => {
    load().catch(console.error);
  }, []);

  async function approve(id: string) {
    if (!token) return;
    await apiRequest(`/admin/withdrawals/${id}/approve`, { method: "POST", token });
    await load();
  }

  async function resolveDispute(id: string, action: "RELEASE_TO_BUYER" | "REFUND_TO_SELLER") {
    if (!token) return;
    await apiRequest(`/admin/disputes/${id}/resolve`, {
      method: "POST",
      token,
      body: JSON.stringify({ action, note: `Mock admin ${action.toLowerCase().replace(/_/g, " ")}.` }),
    });
    await load();
  }

  return (
    <section className="grid gap-6">
      <h1 className="text-2xl font-semibold">Admin panel</h1>

      <section className="rounded-lg border bg-white p-4">
        <h2 className="text-lg font-semibold">Pending withdrawals</h2>
        <div className="mt-3 space-y-2">
          {withdrawals.map((item) => (
            <article key={item.id} className="flex items-center justify-between rounded border p-3">
              <div>
                <p className="font-medium">{item.amountMinor} minor</p>
                <p className="text-sm text-slate-600">{item.destination}</p>
              </div>
              <Button onClick={() => approve(item.id)}>Approve</Button>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-lg border bg-white p-4">
        <h2 className="text-lg font-semibold">Open P2P disputes</h2>
        <div className="mt-3 space-y-2">
          {disputes.map((dispute) => (
            <article key={dispute.id} className="rounded border p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{dispute.reason}</p>
                  <p className="text-sm text-slate-600">Trade {dispute.trade.id}</p>
                  <p className="text-sm text-slate-600">
                    Buyer {dispute.trade.buyerId.slice(0, 8)} | Seller {dispute.trade.sellerId.slice(0, 8)}
                  </p>
                </div>
                <p className="text-sm font-medium text-amber-700">{dispute.status}</p>
              </div>
              <div className="mt-2 grid gap-1 text-sm text-slate-700 md:grid-cols-2">
                <p>Method: {dispute.trade.paymentInstructions?.method ?? "n/a"}</p>
                <p>Receiver: {dispute.trade.paymentInstructions?.receiverName ?? "n/a"}</p>
                <p>Reference: {dispute.trade.paymentProof?.paymentReference ?? "n/a"}</p>
                <p>Proof: {dispute.trade.paymentProof?.proofFileName ?? dispute.trade.paymentProof?.proofUrl ?? "n/a"}</p>
                <p className="md:col-span-2">
                  Evidence: {dispute.evidenceKeys.length > 0 ? dispute.evidenceKeys.join(", ") : "none"}
                </p>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button onClick={() => resolveDispute(dispute.id, "RELEASE_TO_BUYER")}>Release to buyer</Button>
                <Button variant="outline" onClick={() => resolveDispute(dispute.id, "REFUND_TO_SELLER")}>
                  Refund seller
                </Button>
              </div>
            </article>
          ))}
          {disputes.length === 0 ? <p className="text-sm text-slate-600">No open disputes.</p> : null}
        </div>
      </section>

      <section className="rounded-lg border bg-white p-4">
        <h2 className="text-lg font-semibold">Recent audit logs</h2>
        <div className="mt-3 space-y-2 text-sm">
          {logs.map((log) => (
            <article key={log.id} className="rounded border p-3">
              <p className="font-medium">{log.action}</p>
              <p className="text-slate-600">{log.entityType}</p>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}
