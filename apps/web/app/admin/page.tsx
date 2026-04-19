"use client";

import { useEffect, useState } from "react";
import { Button } from "@p2p/ui";
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

export default function AdminPage() {
  const [withdrawals, setWithdrawals] = useState<PendingWithdrawal[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);

  const token = tokenStore.accessToken;

  async function load() {
    if (!token) return;
    const [pending, audit] = await Promise.all([
      apiRequest<PendingWithdrawal[]>("/admin/withdrawals/pending", { token }),
      apiRequest<AuditLog[]>("/admin/audit-logs", { token }),
    ]);
    setWithdrawals(pending);
    setLogs(audit);
  }

  useEffect(() => {
    load().catch(console.error);
  }, []);

  async function approve(id: string) {
    if (!token) return;
    await apiRequest(`/admin/withdrawals/${id}/approve`, { method: "POST", token });
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
