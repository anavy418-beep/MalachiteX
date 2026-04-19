"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { apiRequest, tokenStore } from "@/lib/api";

interface Offer {
  id: string;
  type: string;
  asset: string;
  fiatCurrency: string;
  priceMinor: string;
  minAmountMinor: string;
  maxAmountMinor: string;
  paymentMethod: string;
}

export default function OffersPage() {
  const [offers, setOffers] = useState<Offer[]>([]);

  useEffect(() => {
    apiRequest<Offer[]>("/offers").then(setOffers).catch(console.error);
  }, []);

  async function startTrade(offerId: string) {
    const token = tokenStore.accessToken;
    if (!token) return;

    const amountMinor = prompt("Enter trade amount in minor units");
    if (!amountMinor) return;

    const trade = await apiRequest<{ id: string }>("/trades", {
      method: "POST",
      token,
      body: JSON.stringify({ offerId, amountMinor }),
    });

    window.location.href = `/trades/${trade.id}`;
  }

  return (
    <section className="grid gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">P2P offers</h1>
        <Link href="/offers/create">
          <Button>Create offer</Button>
        </Link>
      </div>
      <div className="space-y-3">
        {offers.map((offer) => (
          <article key={offer.id} className="rounded-lg border bg-white p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">
                  {offer.type} {offer.asset}
                </p>
                <p className="text-sm text-slate-600">
                  Price: {offer.priceMinor} {offer.fiatCurrency} (minor)
                </p>
                <p className="text-sm text-slate-600">Payment: {offer.paymentMethod}</p>
              </div>
              <Button variant="outline" onClick={() => startTrade(offer.id)}>
                Start trade
              </Button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
