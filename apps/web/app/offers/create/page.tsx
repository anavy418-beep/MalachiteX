"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { tokenStore } from "@/lib/api";
import { friendlyErrorMessage } from "@/lib/errors";
import { formatMinorUnits } from "@/lib/money";
import { useAuth } from "@/hooks/use-auth";
import { offersService } from "@/services/offers.service";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type PricingMode = "PRICE" | "MARGIN";
type Side = "BUY" | "SELL";

const REFERENCE_PRICE_MINOR: Record<string, bigint> = {
  USDT_INR: 8300n,
  USDT_USD: 100n,
  BTC_USD: 6850000n,
  BTC_INR: 570000000n,
  ETH_USD: 350000n,
  ETH_INR: 29000000n,
};

export default function CreateOfferPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [side, setSide] = useState<Side>("SELL");
  const [asset, setAsset] = useState("USDT");
  const [fiatCurrency, setFiatCurrency] = useState("INR");
  const [pricingMode, setPricingMode] = useState<PricingMode>("PRICE");
  const [priceMinor, setPriceMinor] = useState("8350");
  const [marginPct, setMarginPct] = useState("1.0");
  const [minAmountMinor, setMinAmountMinor] = useState("10000");
  const [maxAmountMinor, setMaxAmountMinor] = useState("300000");
  const [paymentMethod, setPaymentMethod] = useState("UPI");
  const [paymentReceiverName, setPaymentReceiverName] = useState(user?.username ?? "");
  const [paymentUpiId, setPaymentUpiId] = useState("merchant@upi");
  const [paymentBankName, setPaymentBankName] = useState("");
  const [paymentAccountNumber, setPaymentAccountNumber] = useState("");
  const [paymentIfsc, setPaymentIfsc] = useState("");
  const [terms, setTerms] = useState("Release after verified incoming payment.");

  const calculatedPriceMinor = useMemo(() => {
    if (pricingMode === "PRICE") return priceMinor.trim();

    const key = `${asset.toUpperCase()}_${fiatCurrency.toUpperCase()}`;
    const reference = REFERENCE_PRICE_MINOR[key] ?? 10000n;
    const marginNumber = Number(marginPct || "0");
    const safeMargin = Number.isFinite(marginNumber) ? marginNumber : 0;
    const marginBasisPoints = Math.round(safeMargin * 100);
    const adjusted = reference + (reference * BigInt(marginBasisPoints)) / 10000n;
    return adjusted.toString();
  }, [pricingMode, priceMinor, marginPct, asset, fiatCurrency]);

  const validationError = useMemo(() => {
    if (!asset.trim()) return "Asset is required.";
    if (!fiatCurrency.trim()) return "Currency is required.";
    if (!paymentMethod.trim()) return "Payment method is required.";
    if (!calculatedPriceMinor || BigInt(calculatedPriceMinor || "0") <= 0n) return "Price must be greater than zero.";
    if (!minAmountMinor.trim() || !maxAmountMinor.trim()) return "Min and max amount are required.";
    if (BigInt(minAmountMinor || "0") >= BigInt(maxAmountMinor || "0")) return "Min amount must be lower than max amount.";
    return null;
  }, [asset, fiatCurrency, paymentMethod, calculatedPriceMinor, minAmountMinor, maxAmountMinor]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    const token = tokenStore.accessToken;
    if (!token) {
      setError("Please login first.");
      return;
    }

    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);

    try {
      const created = await offersService.create(
        token,
        {
          type: side,
          asset: asset.toUpperCase(),
          fiatCurrency: fiatCurrency.toUpperCase(),
          priceMinor: calculatedPriceMinor,
          minAmountMinor,
          maxAmountMinor,
          paymentMethod,
          paymentReceiverName,
          paymentUpiId,
          paymentBankName,
          paymentAccountNumber,
          paymentIfsc,
          terms,
        },
        { userId: user?.id, merchantName: user?.username },
      );

      setSuccess(`Offer ${created.id.slice(0, 10)} published successfully.`);
      toast.success("Offer published");
      setTimeout(() => router.push("/offers"), 700);
    } catch (err) {
      setError(friendlyErrorMessage(err, "Unable to publish this offer right now."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="mx-auto max-w-5xl space-y-6">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.2em] text-emerald-300">P2P / Create Offer</p>
        <h1 className="text-3xl font-semibold text-white">Create Offer</h1>
        <p className="text-sm text-slate-400">Publish a premium buy/sell offer with clear limits and trade terms.</p>
      </header>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Offer Configuration</CardTitle>
            <CardDescription>Use integer-safe minor units for all financial amounts.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-5" onSubmit={onSubmit}>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Buy / Sell</Label>
                  <div className="inline-flex rounded-lg border border-zinc-700 bg-zinc-950/70 p-1">
                    <button
                      type="button"
                      onClick={() => setSide("BUY")}
                      className={`rounded-md px-4 py-2 text-sm font-medium transition ${side === "BUY" ? "bg-emerald-600 text-white" : "text-slate-300"}`}
                    >
                      Buy
                    </button>
                    <button
                      type="button"
                      onClick={() => setSide("SELL")}
                      className={`rounded-md px-4 py-2 text-sm font-medium transition ${side === "SELL" ? "bg-emerald-600 text-white" : "text-slate-300"}`}
                    >
                      Sell
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Asset</Label>
                  <select
                    value={asset}
                    onChange={(event) => setAsset(event.target.value)}
                    className="h-10 rounded-md border border-zinc-700 bg-zinc-900 px-3 text-slate-100"
                  >
                    <option value="USDT">USDT</option>
                    <option value="BTC">BTC</option>
                    <option value="ETH">ETH</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <Label>Currency</Label>
                  <select
                    value={fiatCurrency}
                    onChange={(event) => setFiatCurrency(event.target.value)}
                    className="h-10 rounded-md border border-zinc-700 bg-zinc-900 px-3 text-slate-100"
                  >
                    <option value="INR">INR</option>
                    <option value="USD">USD</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <Label>Pricing Mode</Label>
                  <select
                    value={pricingMode}
                    onChange={(event) => setPricingMode(event.target.value as PricingMode)}
                    className="h-10 rounded-md border border-zinc-700 bg-zinc-900 px-3 text-slate-100"
                  >
                    <option value="PRICE">Fixed price (minor)</option>
                    <option value="MARGIN">Margin over reference (%)</option>
                  </select>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                {pricingMode === "PRICE" ? (
                  <label className="grid gap-1 text-sm text-slate-300 md:col-span-1">
                    Price (minor)
                    <Input value={priceMinor} onChange={(event) => setPriceMinor(event.target.value.replace(/[^\d]/g, ""))} />
                  </label>
                ) : (
                  <label className="grid gap-1 text-sm text-slate-300 md:col-span-1">
                    Margin %
                    <Input value={marginPct} onChange={(event) => setMarginPct(event.target.value)} placeholder="1.0" />
                  </label>
                )}

                <label className="grid gap-1 text-sm text-slate-300">
                  Min amount (minor)
                  <Input value={minAmountMinor} onChange={(event) => setMinAmountMinor(event.target.value.replace(/[^\d]/g, ""))} />
                </label>

                <label className="grid gap-1 text-sm text-slate-300">
                  Max amount (minor)
                  <Input value={maxAmountMinor} onChange={(event) => setMaxAmountMinor(event.target.value.replace(/[^\d]/g, ""))} />
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-1 text-sm text-slate-300">
                  Payment method
                  <select
                    value={paymentMethod}
                    onChange={(event) => setPaymentMethod(event.target.value)}
                    className="h-10 rounded-md border border-zinc-700 bg-zinc-900 px-3 text-slate-100"
                  >
                    <option value="UPI">UPI</option>
                    <option value="Google Pay">Google Pay</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="Paytm">Paytm</option>
                  </select>
                </label>
                <label className="grid gap-1 text-sm text-slate-300">
                  Receiver name
                  <Input value={paymentReceiverName} onChange={(event) => setPaymentReceiverName(event.target.value)} />
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-1 text-sm text-slate-300">
                  UPI ID
                  <Input value={paymentUpiId} onChange={(event) => setPaymentUpiId(event.target.value)} placeholder="name@bank" />
                </label>
                <label className="grid gap-1 text-sm text-slate-300">
                  Bank name
                  <Input value={paymentBankName} onChange={(event) => setPaymentBankName(event.target.value)} placeholder="Optional" />
                </label>
                <label className="grid gap-1 text-sm text-slate-300">
                  Account number
                  <Input
                    value={paymentAccountNumber}
                    onChange={(event) => setPaymentAccountNumber(event.target.value.replace(/[^A-Za-z0-9\- ]/g, ""))}
                    placeholder="Optional"
                  />
                </label>
                <label className="grid gap-1 text-sm text-slate-300">
                  IFSC
                  <Input
                    value={paymentIfsc}
                    onChange={(event) => setPaymentIfsc(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                    placeholder="Optional"
                  />
                </label>
              </div>

              <label className="grid gap-1 text-sm text-slate-300">
                Terms
                <textarea
                  value={terms}
                  onChange={(event) => setTerms(event.target.value)}
                  className="min-h-28 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-slate-100"
                />
              </label>

              {validationError ? <Alert variant="error">{validationError}</Alert> : null}
              {error ? <Alert variant="error">{error}</Alert> : null}
              {success ? <Alert variant="success">{success}</Alert> : null}

              <div className="flex justify-end gap-2">
                <Link href="/offers">
                  <Button type="button" variant="outline">
                    Cancel
                  </Button>
                </Link>
                <Button type="submit" disabled={submitting || Boolean(validationError)}>
                  {submitting ? "Publishing..." : "Publish Offer"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="h-fit border-emerald-900/50 bg-gradient-to-br from-emerald-950/40 via-zinc-900 to-zinc-900">
          <CardHeader>
            <CardTitle className="text-lg">Offer Preview</CardTitle>
            <CardDescription>How your offer appears in the market</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Side</p>
              <p className="font-semibold text-slate-100">{side} {asset}</p>
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Price</p>
              <p className="font-semibold text-emerald-300">
                {formatMinorUnits(calculatedPriceMinor || "0", fiatCurrency)}
              </p>
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Trade Limits</p>
              <p className="text-slate-200">
                {formatMinorUnits(minAmountMinor || "0", fiatCurrency)} - {formatMinorUnits(maxAmountMinor || "0", fiatCurrency)}
              </p>
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Payment Method</p>
              <p className="text-slate-200">{paymentMethod}</p>
              <p className="mt-1 text-xs text-slate-500">
                {paymentReceiverName || "Receiver"} {paymentUpiId ? `| ${paymentUpiId}` : ""}
              </p>
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Terms</p>
              <p className="text-slate-300">{terms || "No terms set."}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
