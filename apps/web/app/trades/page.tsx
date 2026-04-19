"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ListChecks } from "lucide-react";
import { tokenStore } from "@/lib/api";
import { formatDateTime, formatMinorUnits } from "@/lib/money";
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
  const normalized = status.toUpperCase();
  if (normalized.includes("COMPLETE") || normalized.includes("RELEASE")) return "text-emerald-300";
  if (normalized.includes("DISPUT")) return "text-amber-300";
  if (normalized.includes("CANCEL")) return "text-red-300";
  if (normalized.includes("SENT") || normalized.includes("PENDING") || normalized.includes("OPEN")) {
    return "text-lime-300";
  }
  return "text-slate-200";
}

function statusLabel(status: string) {
  return status.replace(/_/g, " ");
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
        setError("Session token missing. Showing demo trade list.");
        setLoading(false);
        return;
      }

      try {
        const payload = await tradesService.listMine(token);

        if (payload.length === 0) {
          setTrades(DEMO_TRADES);
          setIsDemo(true);
        } else {
          setTrades(payload);
          setIsDemo(false);
        }
      } catch (err) {
        setTrades(DEMO_TRADES);
        setIsDemo(true);
        setError((err as Error).message);
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
                <p className={`text-sm font-medium ${statusTone(trade.status)}`}>{statusLabel(trade.status)}</p>
              </div>

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

      {isDemo ? <p className="text-xs text-amber-300/80">Showing demo trades for walkthrough.</p> : null}
    </section>
  );
}
