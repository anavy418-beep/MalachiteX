"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { tokenStore } from "@/lib/api";
import { formatDateTime, formatMinorUnits } from "@/lib/money";
import { offersService, type OfferRecord } from "@/services/offers.service";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

function statusTone(status: string) {
  const normalized = status.toUpperCase();
  if (normalized === "ACTIVE") return "border-emerald-700/40 bg-emerald-500/10 text-emerald-200";
  if (normalized === "PAUSED") return "border-amber-700/40 bg-amber-500/10 text-amber-200";
  return "border-zinc-700/50 bg-zinc-900/60 text-slate-300";
}

export default function OffersPage() {
  const { user, isAuthenticated, isBootstrapping } = useAuth();
  const [offers, setOffers] = useState<OfferRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function loadOffers() {
    const token = tokenStore.accessToken;
    if (!user?.id || !token) {
      setOffers([]);
      setLoading(false);
      return;
    }

    try {
      const payload = await offersService.listMine(token, user.id);
      setOffers(
        payload.filter((offer) => {
          const status = (offer.status ?? "ACTIVE").toUpperCase();
          return status !== "ARCHIVED" && status !== "DELETED";
        }),
      );
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadOffers();
  }, [user?.id]);

  const sortedOffers = useMemo(() => {
    return [...offers].sort((a, b) => {
      const at = new Date(a.createdAt ?? 0).getTime();
      const bt = new Date(b.createdAt ?? 0).getTime();
      return bt - at;
    });
  }, [offers]);

  async function togglePause(offer: OfferRecord) {
    const token = tokenStore.accessToken;
    if (!token) return;
    setBusyId(offer.id);
    try {
      const nextStatus = (offer.status ?? "ACTIVE").toUpperCase() === "ACTIVE" ? "PAUSED" : "ACTIVE";
      await offersService.updateStatus(token, offer.id, nextStatus, offer);
      toast.success(nextStatus === "ACTIVE" ? "Offer resumed" : "Offer paused");
      await loadOffers();
    } finally {
      setBusyId(null);
    }
  }

  async function removeOffer(offer: OfferRecord) {
    const token = tokenStore.accessToken;
    if (!token) return;
    setBusyId(offer.id);
    try {
      await offersService.remove(token, offer.id, offer);
      toast.success("Offer archived");
      await loadOffers();
    } finally {
      setBusyId(null);
    }
  }

  if (isBootstrapping) {
    return <p className="text-sm text-slate-400">Loading offers...</p>;
  }

  if (!isAuthenticated) {
    return (
      <section className="space-y-3">
        <h1 className="text-2xl font-semibold text-white">My Offers</h1>
        <p className="text-sm text-slate-400">Please login to manage your offers.</p>
        <Link href="/login">
          <Button>Go to login</Button>
        </Link>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.2em] text-emerald-300">P2P / My Offers</p>
          <h1 className="text-3xl font-semibold text-white">My Offers</h1>
          <p className="text-sm text-slate-400">Manage pricing, status, and market visibility for your offers.</p>
        </div>
        <Link href="/offers/create">
          <Button>Create Offer</Button>
        </Link>
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
          <CardTitle className="text-lg">Offer Management</CardTitle>
          <CardDescription>{sortedOffers.length} offer(s)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="space-y-2">
              <div className="h-16 animate-pulse rounded-lg border border-zinc-800 bg-zinc-900/60" />
              <div className="h-16 animate-pulse rounded-lg border border-zinc-800 bg-zinc-900/60" />
            </div>
          ) : null}

          {!loading && sortedOffers.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-700 px-4 py-6 text-center">
              <p className="text-sm text-slate-300">You have no offers yet.</p>
              <p className="mt-1 text-xs text-slate-500">Create your first offer to appear in the P2P market.</p>
              <div className="mt-3">
                <Link href="/offers/create">
                  <Button>Create Offer</Button>
                </Link>
              </div>
            </div>
          ) : null}

          {sortedOffers.map((offer) => {
            const status = (offer.status ?? "ACTIVE").toUpperCase();
            return (
              <article key={offer.id} className="grid gap-3 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 xl:grid-cols-[1.6fr_1fr_1.1fr_auto] xl:items-center">
                <div>
                  <p className="text-sm font-semibold text-slate-100">
                    {offer.type} {offer.asset}/{offer.fiatCurrency}
                  </p>
                  <p className="text-xs text-slate-400">
                    Price {formatMinorUnits(offer.priceMinor, offer.fiatCurrency)} · {offer.paymentMethod}
                  </p>
                  <p className="text-xs text-slate-500">
                    Created {offer.createdAt ? formatDateTime(offer.createdAt) : "recently"}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-slate-500">Limits</p>
                  <p className="text-sm text-slate-200">
                    {formatMinorUnits(offer.minAmountMinor, offer.fiatCurrency)} -{" "}
                    {formatMinorUnits(offer.maxAmountMinor, offer.fiatCurrency)}
                  </p>
                </div>

                <div>
                  <span className={`inline-flex rounded-full border px-2 py-1 text-xs ${statusTone(status)}`}>
                    {status}
                  </span>
                </div>

                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyId === offer.id}
                    onClick={() => void togglePause(offer)}
                  >
                    {status === "ACTIVE" ? "Pause" : "Resume"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => toast.info("Edit flow is demo-mode and will be expanded next.")}
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-red-700/40 text-red-300 hover:bg-red-950/30"
                    disabled={busyId === offer.id}
                    onClick={() => void removeOffer(offer)}
                  >
                    Delete
                  </Button>
                </div>
              </article>
            );
          })}
        </CardContent>
      </Card>
    </section>
  );
}
