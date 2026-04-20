"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ListChecks } from "lucide-react";
import { tokenStore } from "@/lib/api";
import { formatDateTime, formatMinorUnits } from "@/lib/money";
import { normalizeTradeStatus, tradeStatusLabel } from "@/lib/status";
import { tradesService, type TradeRecord } from "@/services/trades.service";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const DEMO_TRADES: TradeRecord[] = [
  {
    id: "seed-trade-alice-bob-001",
    offerId: "seed-offer-alice-sell-usdt",
    buyerId: "demo-buyer",
    sellerId: "demo-seller",
    amountMinor: "50000",
    fiatPriceMinor: "8500",
    fiatTotalMinor: "4250000",
    escrowHeldMinor: "50000",
    status: "PAYMENT_PENDING",
    createdAt: new Date().toISOString(),
  },
];

function statusTone(status: string) {
  const normalized = normalizeTradeStatus(status);
  if (normalized === "RELEASE_PENDING") return "text-lime-300";
  if (normalized === "COMPLETED") return "text-emerald-300";
  if (normalized === "DISPUTED") return "text-amber-300";
  if (normalized === "CANCELLED") return "text-red-300";
  if (normalized === "PAYMENT_SENT" || normalized === "PAYMENT_PENDING") {
    return "text-lime-300";
  }
  return "text-slate-200";
}

function statusHint(status: string) {
  const normalized = normalizeTradeStatus(status);
  if (normalized === "PAYMENT_PENDING") return "Waiting for buyer payment proof.";
  if (normalized === "PAYMENT_SENT") return "Buyer submitted proof. Seller verification in progress.";
  if (normalized === "RELEASE_PENDING") return "Payment confirmed. Escrow release is pending.";
  if (normalized === "COMPLETED") return "Escrow released and trade settled.";
  if (normalized === "CANCELLED") return "Trade canceled. Escrow was refunded.";
  if (normalized === "DISPUTED") return "Dispute opened. Awaiting review and resolution.";
  return "Status update available in trade workspace.";
}

export default function TradesPage() {
  const [trades, setTrades] = useState<TradeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDemo, setIsDemo] = useState(false);

  useEffect(() => {
    (async () => {
      const token = tokenStore.accessToken;

      if (!token) {
        setTrades(DEMO_TRADES);
        setIsDemo(true);
        setError("Showing a sample trade list. Sign in to view your live P2P trade history.");
        setLoading(false);
        return;
      }

      try {
        const payload = await tradesService.listMine(token);
        setTrades(payload);
        setIsDemo(false);
        setError(null);
      } catch (err) {
        setTrades(DEMO_TRADES);
        setIsDemo(true);
        setError(`Live P2P trades unavailable. Showing sample trades. ${(err as Error).message}`);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.2em] text-emerald-300">Trades</p>
        <h1 className="text-3xl font-semibold text-white">My Trades</h1>
        <p className="text-sm text-slate-400">Track active trade lifecycle and open detail workspace.</p>
      </header>

      {error ? (
        <Card className="border-amber-500/30 bg-amber-950/20">
          <CardContent className="pt-6">
            <p className="text-sm text-amber-200">{error}</p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Trade List</CardTitle>
          <CardDescription>{loading ? "Refreshing trades..." : `${trades.length} trade(s)`}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {trades.map((trade) => (
            <article key={trade.id} className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-slate-400">Trade ID</p>
                  <p className="font-mono text-xs text-slate-200">{trade.id}</p>
                </div>
                <p className={`text-sm font-medium ${statusTone(trade.status)}`}>{tradeStatusLabel(trade.status)}</p>
              </div>
              <p className="mt-2 text-xs text-slate-500">{statusHint(trade.status)}</p>

              <div className="mt-3 grid gap-2 text-sm text-slate-300 sm:grid-cols-3">
                <p>Amount: {formatMinorUnits(trade.amountMinor, "USDT")}</p>
                <p>Total: {formatMinorUnits(trade.fiatTotalMinor, "INR")}</p>
                <p>Opened: {trade.createdAt ? formatDateTime(trade.createdAt) : "-"}</p>
              </div>

              <div className="mt-4 flex justify-end">
                <Link href={`/trades/${trade.id}`}>
                  <Button className="gap-2">
                    <ListChecks className="h-4 w-4" />
                    Open Trade
                  </Button>
                </Link>
              </div>
            </article>
          ))}

          {!loading && trades.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-700 px-3 py-4 text-sm text-slate-500">
              No trades yet. Start from P2P market.
              <div className="mt-3">
                <Link href="/p2p">
                  <Button>Open P2P Market</Button>
                </Link>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {isDemo ? <p className="text-xs text-amber-300/80">Showing sample P2P trades for walkthrough.</p> : null}
    </section>
  );
}
