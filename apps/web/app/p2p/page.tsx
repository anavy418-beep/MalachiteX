"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  ChevronDown,
  Filter,
  Info,
  Plus,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  X,
} from "lucide-react";
import {
  DEMO_P2P_OFFERS,
  P2P_ASSET_OPTIONS,
  P2P_CURRENCY_OPTIONS,
  P2P_PAYMENT_OPTIONS,
  P2P_SORT_OPTIONS,
  type MerchantBadge,
  type P2POfferPreview,
  type P2PSortOption,
} from "@/lib/demo-data";
import { formatMinorUnits } from "@/lib/money";
import { useAuth } from "@/hooks/use-auth";
import { offersService, type OfferRecord } from "@/services/offers.service";
import { tradesService } from "@/services/trades.service";
import { tokenStore } from "@/lib/api";
import { friendlyErrorMessage } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingState } from "@/components/ui/loading-state";

type TradeSide = "BUY" | "SELL";
type MarketOffer = P2POfferPreview & { ownerUserId?: string };

const PRICE_REFERENCE_MINOR: Record<string, bigint> = {
  USDT_INR: 8300n,
  USDT_USD: 100n,
  BTC_USD: 6850000n,
  BTC_INR: 570000000n,
  ETH_USD: 350000n,
  ETH_INR: 29000000n,
};

const DEFAULT_FILTERS = {
  side: "BUY" as TradeSide,
  asset: "USDT" as (typeof P2P_ASSET_OPTIONS)[number],
  currency: "INR" as (typeof P2P_CURRENCY_OPTIONS)[number],
  paymentMethod: "ALL",
  amountMinor: "",
  onlineOnly: false,
  trustedOnly: false,
  sortBy: "best_price" as P2PSortOption,
};

function compareBigInt(a: bigint, b: bigint) {
  if (a === b) return 0;
  return a > b ? 1 : -1;
}

function badgeTone(badge?: MerchantBadge) {
  if (badge === "AMBASSADOR") return "border-cyan-700/40 bg-cyan-500/10 text-cyan-200";
  if (badge === "POWER") return "border-violet-700/40 bg-violet-500/10 text-violet-200";
  if (badge === "VERIFIED") return "border-emerald-700/40 bg-emerald-500/10 text-emerald-200";
  return "border-zinc-700/50 bg-zinc-800/70 text-slate-300";
}

function parseLastSeenMinutes(label: string) {
  if (label.toLowerCase().includes("online")) return 0;
  const match = label.match(/(\d+)/);
  return match ? Number(match[1]) : 999;
}

function formatAssetAmountScaled(value: bigint, scale = 8) {
  const sign = value < 0n ? "-" : "";
  const abs = value < 0n ? value * -1n : value;
  const divider = 10n ** BigInt(scale);
  const major = abs / divider;
  const fraction = (abs % divider).toString().padStart(scale, "0").replace(/0+$/, "");
  return fraction.length > 0 ? `${sign}${major.toString()}.${fraction}` : `${sign}${major.toString()}`;
}

function deterministicFromId(id: string) {
  return [...id].reduce((acc, char) => acc + char.charCodeAt(0), 0);
}

function inferSettlementNetwork(offer: P2POfferPreview) {
  if (offer.asset === "BTC") return "BTC";
  if (offer.asset === "ETH") return "ERC20";
  if (offer.paymentMethod === "UPI" || offer.paymentMethod === "Paytm") return "TRC20";
  return "ERC20";
}

function toPreview(offer: OfferRecord): MarketOffer {
  const seed = deterministicFromId(offer.id);
  const completionRate = 94 + (seed % 6);
  const tradeCount = 90 + (seed % 1250);
  const rating = Number((4.4 + (seed % 6) * 0.1).toFixed(1));
  const online = seed % 3 !== 0;
  const lastSeen = online ? "Online now" : `${3 + (seed % 35)} min ago`;
  const badge = (["VERIFIED", "POWER", "AMBASSADOR"] as const)[seed % 3];
  const key = `${offer.asset.toUpperCase()}_${offer.fiatCurrency.toUpperCase()}`;
  const reference = PRICE_REFERENCE_MINOR[key] ?? BigInt(offer.priceMinor);
  const premiumRaw = ((BigInt(offer.priceMinor) - reference) * 1000n) / (reference || 1n);

  return {
    id: offer.id,
    type: offer.type,
    asset: offer.asset.toUpperCase() as P2POfferPreview["asset"],
    fiatCurrency: offer.fiatCurrency.toUpperCase() as P2POfferPreview["fiatCurrency"],
    priceMinor: offer.priceMinor,
    minAmountMinor: offer.minAmountMinor,
    maxAmountMinor: offer.maxAmountMinor,
    paymentMethod: offer.paymentMethod as P2POfferPreview["paymentMethod"],
    premiumPct: Number(premiumRaw) / 10,
    terms:
      offer.terms?.trim() ||
      "Ensure payment account name matches your verified profile. Release follows confirmation.",
    ownerUserId: offer.userId,
    merchant: {
      id: offer.userId,
      name: offer.merchantName?.trim() || `Trader ${offer.userId.slice(0, 6).toUpperCase()}`,
      avatar: offer.userId.slice(0, 2).toUpperCase(),
      badge,
      completionRate,
      tradeCount,
      rating,
      online,
      lastSeen,
      trusted: completionRate >= 97,
      responseMinutes: 1 + (seed % 10),
    },
  };
}

export default function P2PPage() {
  const router = useRouter();
  const { user, isAuthenticated, isBootstrapping } = useAuth();
  const [offers, setOffers] = useState<MarketOffer[]>([]);
  const [side, setSide] = useState<TradeSide>(DEFAULT_FILTERS.side);
  const [asset, setAsset] = useState<(typeof P2P_ASSET_OPTIONS)[number]>(DEFAULT_FILTERS.asset);
  const [currency, setCurrency] = useState<(typeof P2P_CURRENCY_OPTIONS)[number]>(DEFAULT_FILTERS.currency);
  const [paymentMethod, setPaymentMethod] = useState<string>(DEFAULT_FILTERS.paymentMethod);
  const [amountMinor, setAmountMinor] = useState(DEFAULT_FILTERS.amountMinor);
  const [onlineOnly, setOnlineOnly] = useState(DEFAULT_FILTERS.onlineOnly);
  const [trustedOnly, setTrustedOnly] = useState(DEFAULT_FILTERS.trustedOnly);
  const [sortBy, setSortBy] = useState<P2PSortOption>(DEFAULT_FILTERS.sortBy);
  const [loading, setLoading] = useState(true);
  const [submittingOfferId, setSubmittingOfferId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedOffer, setSelectedOffer] = useState<MarketOffer | null>(null);
  const [tradeAmountMinor, setTradeAmountMinor] = useState("");
  const [tradeError, setTradeError] = useState<string | null>(null);
  const [expandedOfferId, setExpandedOfferId] = useState<string | null>(null);

  async function loadOffers() {
    setLoading(true);
    setError(null);

    try {
      const payload = await offersService.list();
      if (payload.length === 0) {
        setOffers(DEMO_P2P_OFFERS);
        setIsDemo(true);
      } else {
        setOffers(payload.map(toPreview));
        setIsDemo(false);
      }
    } catch (err) {
      setOffers(DEMO_P2P_OFFERS);
      setIsDemo(true);
      setError(friendlyErrorMessage(err, "Live P2P offers are temporarily unavailable. Showing demo offers."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isBootstrapping || !isAuthenticated) {
      setLoading(false);
      setOffers([]);
      setError(null);
      setIsDemo(false);
      return;
    }

    void loadOffers();
  }, [isAuthenticated, isBootstrapping]);

  const activeFilterCount = [
    paymentMethod !== "ALL",
    amountMinor.trim().length > 0,
    onlineOnly,
    trustedOnly,
    sortBy !== "best_price",
  ].filter(Boolean).length;

  function resetFilters() {
    setSide(DEFAULT_FILTERS.side);
    setAsset(DEFAULT_FILTERS.asset);
    setCurrency(DEFAULT_FILTERS.currency);
    setPaymentMethod(DEFAULT_FILTERS.paymentMethod);
    setAmountMinor(DEFAULT_FILTERS.amountMinor);
    setOnlineOnly(DEFAULT_FILTERS.onlineOnly);
    setTrustedOnly(DEFAULT_FILTERS.trustedOnly);
    setSortBy(DEFAULT_FILTERS.sortBy);
  }

  const visibleOffers = useMemo(() => {
    const targetOfferType: P2POfferPreview["type"] = side === "BUY" ? "SELL" : "BUY";
    const enteredAmount = amountMinor.trim() ? BigInt(amountMinor) : null;

    const filtered = offers.filter((offer) => {
      if (offer.type !== targetOfferType) return false;
      if (offer.asset !== asset) return false;
      if (offer.fiatCurrency !== currency) return false;
      if (paymentMethod !== "ALL" && offer.paymentMethod !== paymentMethod) return false;
      if (onlineOnly && !offer.merchant.online) return false;
      if (trustedOnly && !offer.merchant.trusted) return false;
      if (enteredAmount && (enteredAmount < BigInt(offer.minAmountMinor) || enteredAmount > BigInt(offer.maxAmountMinor))) {
        return false;
      }
      return true;
    });

    return filtered.sort((a, b) => {
      if (sortBy === "best_price") {
        const comparison = compareBigInt(BigInt(a.priceMinor), BigInt(b.priceMinor));
        return side === "BUY" ? comparison : -comparison;
      }
      if (sortBy === "most_completed") return b.merchant.tradeCount - a.merchant.tradeCount;
      if (sortBy === "fastest_response") return a.merchant.responseMinutes - b.merchant.responseMinutes;
      return parseLastSeenMinutes(a.merchant.lastSeen) - parseLastSeenMinutes(b.merchant.lastSeen);
    });
  }, [offers, side, asset, currency, paymentMethod, amountMinor, onlineOnly, trustedOnly, sortBy]);

  function openTradeModal(offer: MarketOffer) {
    if (!isAuthenticated) {
      router.push(`/login?next=${encodeURIComponent("/p2p")}`);
      return;
    }

    const token = tokenStore.accessToken;
    if (offer.ownerUserId && offer.ownerUserId === user?.id) {
      setError("This is your own offer. Manage it from My Offers.");
      return;
    }
    if (!token) {
      setError("Session is syncing. Please try again in a moment.");
      return;
    }

    setSelectedOffer(offer);
    setTradeAmountMinor(offer.minAmountMinor);
    setTradeError(null);
  }

  const tradeCalc = useMemo(() => {
    if (!selectedOffer) return null;

    const min = BigInt(selectedOffer.minAmountMinor);
    const max = BigInt(selectedOffer.maxAmountMinor);
    const trimmed = tradeAmountMinor.trim();
    const entered = trimmed.length > 0 ? BigInt(trimmed) : 0n;
    const hasInput = trimmed.length > 0;
    const positive = entered > 0n;
    const withinRange = entered >= min && entered <= max;
    const valid = hasInput && positive && withinRange;
    const price = BigInt(selectedOffer.priceMinor) || 1n;
    const receiveScaled = (entered * 100000000n) / price;

    let reason = "";
    if (!hasInput) reason = "Enter an amount to continue.";
    else if (!positive) reason = "Amount must be greater than zero.";
    else if (!withinRange) {
      reason = `Amount must be between ${formatMinorUnits(min, selectedOffer.fiatCurrency)} and ${formatMinorUnits(
        max,
        selectedOffer.fiatCurrency,
      )}.`;
    }

    return {
      entered,
      min,
      max,
      valid,
      reason,
      receiveText: formatAssetAmountScaled(receiveScaled, 8),
    };
  }, [selectedOffer, tradeAmountMinor]);

  async function submitTrade() {
    if (!selectedOffer || !tradeCalc) return;
    if (!tradeCalc.valid) {
      setTradeError(tradeCalc.reason || "Invalid trade amount.");
      return;
    }

    const token = tokenStore.accessToken;
    if (!isAuthenticated) {
      router.push(`/login?next=${encodeURIComponent("/p2p")}`);
      return;
    }

    if (!token) {
      setTradeError("Session is syncing. Please try again in a moment.");
      return;
    }

    setSubmittingOfferId(selectedOffer.id);
    setError(null);
    setTradeError(null);

    try {
      const trade = await tradesService.create(token, {
        offerId: selectedOffer.id,
        amountMinor: tradeCalc.entered.toString(),
      });

      setSelectedOffer(null);
      router.push(`/trades/${trade.id}`);
    } catch (err) {
      setTradeError(friendlyErrorMessage(err, "Unable to start this trade right now."));
    } finally {
      setSubmittingOfferId(null);
    }
  }

  if (isBootstrapping) {
    return <LoadingState label="Loading P2P workspace" />;
  }

  if (!isAuthenticated) {
    return (
      <section className="space-y-3">
        <h1 className="text-2xl font-semibold text-white">P2P Market</h1>
        <p className="text-sm text-slate-400">Your session is not active. Please log in to access the P2P desk.</p>
        <Link href="/login">
          <Button>Go to login</Button>
        </Link>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.2em] text-emerald-300">MalachiteX P2P Desk</p>
        <h1 className="text-3xl font-semibold text-white">P2P Market</h1>
        <p className="text-sm text-slate-400">Premium exchange-style desk for fast peer-to-peer crypto trades.</p>
      </header>

      <Card className="border-emerald-900/50 bg-gradient-to-br from-emerald-950/40 via-zinc-900 to-zinc-900">
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm text-emerald-100">
              <ShieldCheck className="h-4 w-4 text-emerald-300" />
              Escrow-backed demo marketplace flow for secure staged transactions.
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/offers/create">
                <Button className="gap-2">
                  <Plus className="h-4 w-4" />
                  Create Offer
                </Button>
              </Link>
              <Button variant="outline" className="gap-2" onClick={() => setShowFilters((prev) => !prev)}>
                <Filter className="h-4 w-4" />
                Filters {activeFilterCount > 0 ? `(${activeFilterCount})` : ""}
              </Button>
              <Button variant="outline" className="gap-2" onClick={() => void loadOffers()}>
                <RefreshCw className="h-4 w-4" />
                Refresh
              </Button>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-[auto_180px_180px_1fr]">
            <div className="inline-flex rounded-lg border border-zinc-700 bg-zinc-950/70 p-1">
              <button
                onClick={() => setSide("BUY")}
                className={`rounded-md px-4 py-2 text-sm font-medium transition ${
                  side === "BUY" ? "bg-emerald-600 text-white" : "text-slate-300"
                }`}
              >
                Buy
              </button>
              <button
                onClick={() => setSide("SELL")}
                className={`rounded-md px-4 py-2 text-sm font-medium transition ${
                  side === "SELL" ? "bg-emerald-600 text-white" : "text-slate-300"
                }`}
              >
                Sell
              </button>
            </div>
            <select
              value={asset}
              onChange={(event) => setAsset(event.target.value as (typeof P2P_ASSET_OPTIONS)[number])}
              className="h-10 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500"
            >
              {P2P_ASSET_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
            <select
              value={currency}
              onChange={(event) => setCurrency(event.target.value as (typeof P2P_CURRENCY_OPTIONS)[number])}
              className="h-10 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500"
            >
              {P2P_CURRENCY_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
            <input
              value={amountMinor}
              onChange={(event) => setAmountMinor(event.target.value.replace(/[^\d]/g, ""))}
              className="h-10 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:ring-2 focus:ring-emerald-500"
              placeholder={`Amount (${currency} minor units)`}
            />
          </div>

          {showFilters ? (
            <div className="grid gap-3 rounded-xl border border-zinc-800 bg-zinc-950/70 p-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-1.5">
                <p className="text-xs uppercase tracking-wide text-slate-400">Side</p>
                <select
                  value={side}
                  onChange={(event) => setSide(event.target.value as TradeSide)}
                  className="h-10 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="BUY">Buy</option>
                  <option value="SELL">Sell</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <p className="text-xs uppercase tracking-wide text-slate-400">Asset</p>
                <select
                  value={asset}
                  onChange={(event) => setAsset(event.target.value as (typeof P2P_ASSET_OPTIONS)[number])}
                  className="h-10 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {P2P_ASSET_OPTIONS.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <p className="text-xs uppercase tracking-wide text-slate-400">Currency</p>
                <select
                  value={currency}
                  onChange={(event) => setCurrency(event.target.value as (typeof P2P_CURRENCY_OPTIONS)[number])}
                  className="h-10 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {P2P_CURRENCY_OPTIONS.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <p className="text-xs uppercase tracking-wide text-slate-400">Payment</p>
                <select
                  value={paymentMethod}
                  onChange={(event) => setPaymentMethod(event.target.value)}
                  className="h-10 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="ALL">All methods</option>
                  {P2P_PAYMENT_OPTIONS.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <p className="text-xs uppercase tracking-wide text-slate-400">Amount</p>
                <input
                  value={amountMinor}
                  onChange={(event) => setAmountMinor(event.target.value.replace(/[^\d]/g, ""))}
                  className="h-10 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:ring-2 focus:ring-emerald-500"
                  placeholder="Minor units"
                />
              </div>
              <label className="inline-flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900/70 px-3 py-2 text-sm text-slate-200">
                <input
                  type="checkbox"
                  checked={onlineOnly}
                  onChange={(event) => setOnlineOnly(event.target.checked)}
                  className="h-4 w-4 rounded border-zinc-600 bg-zinc-900 text-emerald-500"
                />
                Online only
              </label>
              <label className="inline-flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900/70 px-3 py-2 text-sm text-slate-200">
                <input
                  type="checkbox"
                  checked={trustedOnly}
                  onChange={(event) => setTrustedOnly(event.target.checked)}
                  className="h-4 w-4 rounded border-zinc-600 bg-zinc-900 text-emerald-500"
                />
                Trusted merchants only
              </label>
              <div className="space-y-1.5">
                <p className="text-xs uppercase tracking-wide text-slate-400">Sort by</p>
                <select
                  value={sortBy}
                  onChange={(event) => setSortBy(event.target.value as P2PSortOption)}
                  className="h-10 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {P2P_SORT_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-end justify-end md:col-span-2 xl:col-span-1">
                <Button variant="outline" className="w-full gap-2" onClick={resetFilters}>
                  <RotateCcw className="h-4 w-4" />
                  Reset Filters
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {error ? (
        <Card className="border-amber-500/30 bg-amber-950/20">
          <CardContent className="pt-6">
            <p className="text-sm text-amber-200">{error}</p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Available Offers</CardTitle>
          <CardDescription>
            {loading ? "Refreshing offers..." : `${visibleOffers.length} ${side.toLowerCase()} opportunities found`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {visibleOffers.map((offer) => {
            const actionLabel = side === "BUY" ? "Buy" : "Sell";
            const previewAmount = amountMinor.trim() ? BigInt(amountMinor) : BigInt(offer.minAmountMinor);
            const previewReceive = formatAssetAmountScaled(
              (previewAmount * 100000000n) / (BigInt(offer.priceMinor) || 1n),
              8,
            );
            const isOwnOffer = Boolean(user?.id && offer.ownerUserId === user.id);

            return (
              <article key={offer.id} className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
                <div className="grid gap-4 xl:grid-cols-[1.7fr_1fr_1fr_auto]">
                  <div className="space-y-2">
                    <div className="flex items-start gap-3">
                      <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-900/40 font-semibold text-emerald-200">
                        {offer.merchant.avatar}
                        <span
                          className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border border-zinc-900 ${
                            offer.merchant.online ? "bg-emerald-400" : "bg-zinc-500"
                          }`}
                        />
                      </div>
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-slate-100">{offer.merchant.name}</p>
                          {isOwnOffer ? (
                            <span className="inline-flex rounded-full border border-emerald-700/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-200">
                              Your offer
                            </span>
                          ) : null}
                          {offer.merchant.badge ? (
                            <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] ${badgeTone(offer.merchant.badge)}`}>
                              {offer.merchant.badge}
                            </span>
                          ) : null}
                          {offer.merchant.trusted ? (
                            <span className="inline-flex rounded-full border border-emerald-700/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-200">
                              Trusted
                            </span>
                          ) : null}
                        </div>
                        <p className="text-xs text-slate-400">
                          {offer.merchant.online ? "Online now" : `Last seen ${offer.merchant.lastSeen}`} ·{" "}
                          {offer.merchant.completionRate}% completion · {offer.merchant.tradeCount} trades ·{" "}
                          {offer.merchant.rating.toFixed(1)} rating
                        </p>
                      </div>
                    </div>
                    <p className="text-xs text-slate-400">Payment method: {offer.paymentMethod}</p>
                  </div>

                  <div className="space-y-1">
                    <p className="text-xs uppercase tracking-wide text-slate-400">Price</p>
                    <p className="text-lg font-semibold text-emerald-300">
                      {formatMinorUnits(offer.priceMinor, offer.fiatCurrency)}
                    </p>
                    <p className={`text-xs ${offer.premiumPct >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                      Premium {offer.premiumPct >= 0 ? "+" : ""}
                      {offer.premiumPct.toFixed(1)}%
                    </p>
                  </div>

                  <div className="space-y-1">
                    <p className="text-xs uppercase tracking-wide text-slate-400">Limits</p>
                    <p className="text-sm text-slate-200">
                      {formatMinorUnits(offer.minAmountMinor, offer.fiatCurrency)} -{" "}
                      {formatMinorUnits(offer.maxAmountMinor, offer.fiatCurrency)}
                    </p>
                    <p className="text-xs text-slate-400">
                      Receive preview: ~{previewReceive} {offer.asset}
                    </p>
                  </div>

                  <div className="flex flex-col items-end justify-between gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => setExpandedOfferId((prev) => (prev === offer.id ? null : offer.id))}
                    >
                      <Info className="h-3.5 w-3.5" />
                      Terms
                    </Button>
                    <Button
                      className="gap-2"
                      onClick={() => (isOwnOffer ? router.push("/offers") : openTradeModal(offer))}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      {isOwnOffer ? "Manage Offer" : `${actionLabel} ${offer.asset}`}
                    </Button>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-xs text-slate-400">
                  <span>{offer.asset}/{offer.fiatCurrency}</span>
                  <span className="inline-flex items-center gap-1">
                    Trade terms
                    <ChevronDown
                      className={`h-3.5 w-3.5 transition ${expandedOfferId === offer.id ? "rotate-180" : ""}`}
                    />
                  </span>
                </div>
                {expandedOfferId === offer.id ? <p className="mt-2 text-xs text-slate-500">{offer.terms}</p> : null}
              </article>
            );
          })}

          {!loading && visibleOffers.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-700 px-4 py-6 text-center">
              <p className="text-sm text-slate-400">No offers match your current filters.</p>
              <p className="mt-1 text-xs text-slate-500">Try changing asset, payment method, amount, or trusted/online filters.</p>
              <div className="mt-3">
                <Button variant="outline" className="gap-2" onClick={resetFilters}>
                  <RotateCcw className="h-4 w-4" />
                  Reset Filters
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {selectedOffer ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4">
          <Card className="w-full max-w-lg border-zinc-700 bg-zinc-950">
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div>
                <CardTitle className="text-lg">{side === "BUY" ? "Start Buy Trade" : "Start Sell Trade"}</CardTitle>
                <CardDescription>
                  {selectedOffer.asset}/{selectedOffer.fiatCurrency} with {selectedOffer.merchant.name}
                </CardDescription>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="h-9 w-9 p-0"
                onClick={() => setSelectedOffer(null)}
                aria-label="Close trade modal"
              >
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 text-sm md:grid-cols-2">
                <p className="text-slate-300">
                  Price:{" "}
                  <span className="font-semibold text-emerald-300">
                    {formatMinorUnits(selectedOffer.priceMinor, selectedOffer.fiatCurrency)}
                  </span>
                </p>
                <p className="text-slate-300">
                  Payment: <span className="font-semibold text-slate-100">{selectedOffer.paymentMethod}</span>
                </p>
                <p className="text-slate-300">
                  Settlement:{" "}
                  <span className="font-semibold text-slate-100">
                    {selectedOffer.asset} · {inferSettlementNetwork(selectedOffer)}
                  </span>
                </p>
                <p className="text-slate-300">
                  Limits:{" "}
                  <span className="font-semibold text-slate-100">
                    {formatMinorUnits(selectedOffer.minAmountMinor, selectedOffer.fiatCurrency)} -{" "}
                    {formatMinorUnits(selectedOffer.maxAmountMinor, selectedOffer.fiatCurrency)}
                  </span>
                </p>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="trade-amount" className="text-xs uppercase tracking-wide text-slate-400">
                  Amount ({selectedOffer.fiatCurrency} minor units)
                </label>
                <input
                  id="trade-amount"
                  value={tradeAmountMinor}
                  onChange={(event) => {
                    setTradeAmountMinor(event.target.value.replace(/[^\d]/g, ""));
                    setTradeError(null);
                  }}
                  className="h-10 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder={selectedOffer.minAmountMinor}
                />
                {tradeCalc ? (
                  <p className={`text-xs ${tradeCalc.valid ? "text-emerald-300" : "text-red-300"}`}>
                    Receive ~ {tradeCalc.receiveText} {selectedOffer.asset}
                    {tradeCalc.valid ? "" : ` (${tradeCalc.reason})`}
                  </p>
                ) : null}
              </div>

              <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-400">Trade Terms</p>
                <ul className="mt-2 space-y-1 text-sm text-slate-300">
                  {selectedOffer.terms
                    .split(".")
                    .map((line) => line.trim())
                    .filter(Boolean)
                    .map((line) => (
                      <li key={line} className="flex gap-2">
                        <span className="mt-1 h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        <span>{line}.</span>
                      </li>
                    ))}
                </ul>
              </div>

              {tradeError ? (
                <p className="rounded-lg border border-red-800/40 bg-red-950/20 px-3 py-2 text-xs text-red-300">
                  {tradeError}
                </p>
              ) : null}

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setSelectedOffer(null)}>
                  Close
                </Button>
                <Button
                  onClick={() => void submitTrade()}
                  disabled={!tradeCalc?.valid || submittingOfferId === selectedOffer.id}
                >
                  {submittingOfferId === selectedOffer.id ? "Joining..." : "Join Trade"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {isDemo ? <p className="text-xs text-amber-300/80">Showing demo market offers for preview.</p> : null}
    </section>
  );
}

