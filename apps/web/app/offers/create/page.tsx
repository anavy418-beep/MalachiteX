"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@p2p/ui";
import { apiRequest, tokenStore } from "@/lib/api";

export default function CreateOfferPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const token = tokenStore.accessToken;
    if (!token) {
      setError("Please login first");
      return;
    }

    const formData = new FormData(event.currentTarget);

    try {
      await apiRequest("/offers", {
        method: "POST",
        token,
        body: JSON.stringify({
          type: formData.get("type"),
          asset: formData.get("asset"),
          fiatCurrency: formData.get("fiatCurrency"),
          priceMinor: formData.get("priceMinor"),
          minAmountMinor: formData.get("minAmountMinor"),
          maxAmountMinor: formData.get("maxAmountMinor"),
          paymentMethod: formData.get("paymentMethod"),
          terms: formData.get("terms"),
        }),
      });

      router.push("/offers");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <section className="mx-auto max-w-2xl rounded-xl border bg-white p-6 shadow-sm">
      <h1 className="text-2xl font-semibold">Create offer</h1>
      <form className="mt-6 grid gap-4" onSubmit={onSubmit}>
        <select name="type" className="h-10 rounded-md border px-3">
          <option value="BUY">BUY</option>
          <option value="SELL">SELL</option>
        </select>
        <input name="asset" required className="h-10 rounded-md border px-3" placeholder="Asset (e.g. USDT)" />
        <input name="fiatCurrency" required className="h-10 rounded-md border px-3" placeholder="Fiat currency (e.g. INR)" />
        <input name="priceMinor" type="number" required className="h-10 rounded-md border px-3" placeholder="Price minor" />
        <input name="minAmountMinor" type="number" required className="h-10 rounded-md border px-3" placeholder="Min amount minor" />
        <input name="maxAmountMinor" type="number" required className="h-10 rounded-md border px-3" placeholder="Max amount minor" />
        <input name="paymentMethod" required className="h-10 rounded-md border px-3" placeholder="Payment method" />
        <textarea name="terms" className="min-h-28 rounded-md border px-3 py-2" placeholder="Offer terms" />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button type="submit">Publish offer</Button>
      </form>
    </section>
  );
}
