
"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  BookOpen,
  Bot,
  Building2,
  CircleDollarSign,
  CreditCard,
  Gift,
  Globe2,
  Handshake,
  Headphones,
  HelpCircle,
  Landmark,
  MessageSquare,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Store,
  SwatchBook,
  Users2,
  WalletCards,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type MarketOverviewPair = {
  symbol: string;
  displaySymbol?: string;
  lastPrice: string;
  priceChangePercent: string;
  quoteVolume: string;
};

type MarketOverviewFlatRow = {
  symbol?: string;
  price?: number;
  lastPrice?: string;
  change24h?: number;
  priceChangePercent?: string;
  volume24h?: number;
  quoteVolume?: string;
};

type MarketOverviewResponse = {
  pairs?: Array<MarketOverviewPair | MarketOverviewFlatRow>;
  topGainers?: Array<MarketOverviewPair | MarketOverviewFlatRow>;
  topLosers?: Array<MarketOverviewPair | MarketOverviewFlatRow>;
  overview?: MarketOverviewFlatRow[];
  updatedAt?: number;
  fallback?: boolean;
  details?: string;
  source?: "binance" | "coingecko" | "cache";
};

const OVERVIEW_SYMBOLS = [
  "BTCUSDT",
  "ETHUSDT",
  "SOLUSDT",
  "BNBUSDT",
  "XRPUSDT",
  "DOGEUSDT",
  "ADAUSDT",
  "AVAXUSDT",
  "LINKUSDT",
  "TONUSDT",
  "TRXUSDT",
  "LTCUSDT",
  "BCHUSDT",
  "SHIBUSDT",
  "DOTUSDT",
  "NEARUSDT",
];

const quickPaymentChips = ["UPI", "Bank Transfer", "Paytm", "Gift Card", "Wallet"];
const quickTradeAssets = ["BTC", "ETH", "USDT", "BNB", "SOL", "XRP"];
const quickCountries = ["India", "UAE", "Nigeria", "Pakistan", "Brazil", "Indonesia"];

const productCards = [
  { icon: MessageSquare, title: "P2P Trading", body: "Find verified buyers and sellers with escrow protection.", cta: "Open P2P", href: "/p2p" },
  { icon: WalletCards, title: "Wallet", body: "Custodial wallet balances, transfers, and settlement tracking.", cta: "Open Wallet", href: "/wallet" },
  { icon: SwatchBook, title: "Instant Swap", body: "Swap supported assets instantly with transparent rates.", cta: "Swap Demo", href: "/markets" },
  { icon: Gift, title: "Gift Cards", body: "Buy and redeem digital gift cards via crypto balance.", cta: "View Gift Desk", href: "/p2p" },
  { icon: Building2, title: "OTC Desk", body: "High-volume assisted trading for premium users and partners.", cta: "Request OTC", href: "/p2p" },
  { icon: CreditCard, title: "Virtual Card", body: "Spend crypto through virtual payment rails in supported regions.", cta: "Coming Soon", href: "/wallet" },
  { icon: CircleDollarSign, title: "Direct Buy", body: "Buy major assets quickly with local payment methods.", cta: "Buy Crypto", href: "/markets" },
  { icon: Landmark, title: "Cash Out", body: "Sell crypto and settle to supported banks and local rails.", cta: "Sell Crypto", href: "/p2p" },
];

const trustPoints = [
  { icon: ShieldCheck, title: "Secure P2P Trading", body: "Escrow lifecycle and participant permissions reduce settlement risk." },
  { icon: WalletCards, title: "Multiple Payment Methods", body: "UPI, local bank transfer, wallets, and other rails for flexible deals." },
  { icon: Globe2, title: "Global Access", body: "Cross-region marketplace experience with localized payments and assets." },
  { icon: Zap, title: "Fast Settlement", body: "Optimized trade flow for quick matching, proof checks, and release." },
  { icon: HelpCircle, title: "Dispute Protection", body: "Structured dispute workflow with proof trail and moderated decisions." },
  { icon: BadgeCheck, title: "Wallet Security", body: "Ledger-first accounting patterns for traceable wallet state." },
];

const trustStats = [
  { label: "Supported Countries", value: "120+" },
  { label: "Payment Methods", value: "350+" },
  { label: "Avg Trade Time", value: "7 min" },
  { label: "Platform Uptime", value: "99.95%" },
  { label: "Total Volume", value: "$8.4B" },
  { label: "24/7 Support", value: "Always On" },
];

const supportItems = [
  { icon: BookOpen, title: "Help Center", body: "Guides for onboarding, wallet, and trade lifecycle.", cta: "Browse Articles", href: "/p2p" },
  { icon: Bot, title: "Academy", body: "Learn crypto safety, P2P best practices, and platform tips.", cta: "Start Learning", href: "/markets" },
  { icon: Headphones, title: "Contact Support", body: "Reach support for urgent settlement or account help.", cta: "Open Support", href: "/p2p" },
  { icon: HelpCircle, title: "FAQ", body: "Quick answers for payments, limits, and dispute handling.", cta: "Read FAQ", href: "/p2p" },
];

const partnerPrograms = [
  { icon: Users2, title: "Referral Program", body: "Invite traders and earn rewards on activity milestones." },
  { icon: Handshake, title: "Partner Program", body: "Integrate market distribution with flexible revenue sharing." },
  { icon: Store, title: "Merchant / OTC", body: "Enable OTC settlement and merchant rails for high-volume businesses." },
];

const footerColumns = [
  {
    heading: "Products",
    links: [
      { label: "P2P", href: "/p2p" },
      { label: "Wallet", href: "/wallet" },
      { label: "Swap", href: "/markets" },
      { label: "Fees", href: "/markets" },
    ],
  },
  {
    heading: "Company",
    links: [
      { label: "About", href: "/" },
      { label: "Careers", href: "/p2p" },
      { label: "Partner Program", href: "/p2p" },
      { label: "Status", href: "https://api-production-60fa.up.railway.app/api/health", external: true },
    ],
  },
  {
    heading: "Support",
    links: [
      { label: "Help Center", href: "/p2p" },
      { label: "Academy", href: "/markets" },
      { label: "Contact", href: "/p2p" },
      { label: "FAQ", href: "/p2p" },
    ],
  },
  {
    heading: "Developers",
    links: [
      { label: "API Docs", href: "https://api-production-60fa.up.railway.app/api/docs", external: true },
      { label: "WebSocket", href: "/demo-trading" },
      { label: "Sandbox", href: "/demo-trading" },
      { label: "System Status", href: "https://api-production-60fa.up.railway.app/api/health", external: true },
    ],
  },
  {
    heading: "Legal",
    links: [
      { label: "Privacy", href: "/" },
      { label: "Terms", href: "/" },
      { label: "Risk Disclosure", href: "/" },
      { label: "Compliance", href: "/" },
    ],
  },
];

const workflow = [
  "Create or browse a P2P offer",
  "Escrow locks seller funds",
  "Buyer uploads payment proof",
  "Seller releases crypto after verification",
];

function parseNumeric(value: string) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toDisplayPair(symbol: string) {
  const upper = symbol.toUpperCase();
  const quotes = ["USDT", "USDC", "BTC", "ETH", "BNB"];
  for (const quote of quotes) {
    if (upper.endsWith(quote) && upper.length > quote.length) {
      return `${upper.slice(0, -quote.length)}/${quote}`;
    }
  }
  return upper;
}

function formatMarketPrice(raw: string) {
  const value = parseNumeric(raw);
  if (value >= 1000) return `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  if (value >= 1) return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 8 })}`;
}

function formatPercent(raw: string) {
  const value = parseNumeric(raw);
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function formatCompact(value: number) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);
}

const COIN_ICON_MAP: Record<string, string> = {
  BTC: "https://assets.coingecko.com/coins/images/1/large/bitcoin.png",
  ETH: "https://assets.coingecko.com/coins/images/279/large/ethereum.png",
  SOL: "https://assets.coingecko.com/coins/images/4128/large/solana.png",
  BNB: "https://assets.coingecko.com/coins/images/825/large/bnb-icon2_2x.png",
  XRP: "https://assets.coingecko.com/coins/images/44/large/xrp-symbol-white-128.png",
  DOGE: "https://assets.coingecko.com/coins/images/5/large/dogecoin.png",
  ADA: "https://assets.coingecko.com/coins/images/975/large/cardano.png",
  AVAX: "https://assets.coingecko.com/coins/images/12559/large/Avalanche_Circle_RedWhite_Trans.png",
  LINK: "https://assets.coingecko.com/coins/images/877/large/chainlink-new-logo.png",
  TON: "https://assets.coingecko.com/coins/images/17980/large/ton_symbol.png",
  TRX: "https://assets.coingecko.com/coins/images/1094/large/tron-logo.png",
  LTC: "https://assets.coingecko.com/coins/images/2/large/litecoin.png",
  BCH: "https://assets.coingecko.com/coins/images/780/large/bitcoin-cash-circle.png",
  SHIB: "https://assets.coingecko.com/coins/images/11939/large/shiba.png",
  DOT: "https://assets.coingecko.com/coins/images/12171/large/polkadot.png",
  NEAR: "https://assets.coingecko.com/coins/images/10365/large/near.jpg",
};

function normalizeOverviewPair(raw: MarketOverviewPair | MarketOverviewFlatRow): MarketOverviewPair | null {
  const symbol = String(raw.symbol ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (!symbol || symbol.length < 6) return null;

  const rawPrice =
    typeof (raw as MarketOverviewPair).lastPrice === "string"
      ? (raw as MarketOverviewPair).lastPrice
      : String((raw as MarketOverviewFlatRow).price ?? "0");
  const rawChange =
    typeof (raw as MarketOverviewPair).priceChangePercent === "string"
      ? (raw as MarketOverviewPair).priceChangePercent
      : String((raw as MarketOverviewFlatRow).change24h ?? "0");
  const rawVolume =
    typeof (raw as MarketOverviewPair).quoteVolume === "string"
      ? (raw as MarketOverviewPair).quoteVolume
      : String((raw as MarketOverviewFlatRow).volume24h ?? "0");

  const price = parseNumeric(rawPrice);
  if (!Number.isFinite(price) || price <= 0) return null;

  return {
    symbol,
    displaySymbol: (raw as MarketOverviewPair).displaySymbol ?? toDisplayPair(symbol),
    lastPrice: String(rawPrice),
    priceChangePercent: String(rawChange),
    quoteVolume: String(rawVolume),
  };
}

function symbolBaseAsset(symbol: string) {
  const label = toDisplayPair(symbol);
  return label.includes("/") ? label.split("/")[0] : symbol.slice(0, 3);
}

function iconForSymbol(symbol: string) {
  const base = symbolBaseAsset(symbol);
  return COIN_ICON_MAP[base] ?? "/icons/coin-fallback.png";
}

export default function HomePage() {
  const [tradeSide, setTradeSide] = useState<"BUY" | "SELL">("BUY");
  const [asset, setAsset] = useState("USDT");
  const [amount, setAmount] = useState("500");
  const [paymentMethod, setPaymentMethod] = useState("UPI");
  const [country, setCountry] = useState("India");
  const [marketPairs, setMarketPairs] = useState<MarketOverviewPair[]>([]);
  const [marketLoading, setMarketLoading] = useState(true);
  const [marketError, setMarketError] = useState<string | null>(null);
  const [marketUpdatedAt, setMarketUpdatedAt] = useState<string | null>(null);
  const hasLiveMarketSnapshotRef = useRef(false);

  useEffect(() => {
    let active = true;
    const overviewUrl = `/api/markets/overview?symbols=${OVERVIEW_SYMBOLS.join(",")}`;

    const fetchOverview = async () => {
      try {
        const response = await fetch(overviewUrl, { cache: "no-store" });

        if (!response.ok) {
          throw new Error(`Market overview request failed (${response.status}).`);
        }

        const payload = (await response.json()) as MarketOverviewResponse;
        if (!active) return;

        const rawPairs = Array.isArray(payload.pairs)
          ? payload.pairs
          : Array.isArray(payload.overview)
            ? payload.overview
            : [];
        const normalizedPairs = rawPairs.map(normalizeOverviewPair).filter((pair): pair is MarketOverviewPair => Boolean(pair));
        const isFallbackPayload = payload.fallback === true;

        if (normalizedPairs.length > 0) {
          setMarketPairs(normalizedPairs);
          hasLiveMarketSnapshotRef.current = true;
        }

        if (typeof payload.updatedAt === "number") {
          setMarketUpdatedAt(new Date(payload.updatedAt).toLocaleTimeString());
        } else {
          setMarketUpdatedAt((current) => current ?? new Date().toLocaleTimeString());
        }

        if (isFallbackPayload) {
          if (hasLiveMarketSnapshotRef.current) {
            setMarketError("Using recent cached market snapshot. Live refresh will resume automatically.");
          } else {
            setMarketError("Live market preview is temporarily unavailable.");
          }
        } else {
          setMarketError(null);
        }
      } catch (error) {
        if (!active) return;
        if (hasLiveMarketSnapshotRef.current) {
          setMarketError("Using recent cached market snapshot. Live refresh will resume automatically.");
        } else {
          setMarketError("Live market preview is temporarily unavailable.");
        }
      } finally {
        if (active) setMarketLoading(false);
      }
    };

    fetchOverview();
    const interval = setInterval(fetchOverview, 45_000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  const gainers = useMemo(
    () => [...marketPairs].sort((a, b) => parseNumeric(b.priceChangePercent) - parseNumeric(a.priceChangePercent)).slice(0, 4),
    [marketPairs],
  );
  const losers = useMemo(
    () => [...marketPairs].sort((a, b) => parseNumeric(a.priceChangePercent) - parseNumeric(b.priceChangePercent)).slice(0, 4),
    [marketPairs],
  );
  const popular = useMemo(
    () => [...marketPairs].sort((a, b) => parseNumeric(b.quoteVolume) - parseNumeric(a.quoteVolume)).slice(0, 4),
    [marketPairs],
  );
  const trending = useMemo(
    () => [...marketPairs]
      .sort((a, b) => {
        const aScore = Math.abs(parseNumeric(a.priceChangePercent)) * 100 + Math.log10(parseNumeric(a.quoteVolume) + 1);
        const bScore = Math.abs(parseNumeric(b.priceChangePercent)) * 100 + Math.log10(parseNumeric(b.quoteVolume) + 1);
        return bScore - aScore;
      })
      .slice(0, 4),
    [marketPairs],
  );

  return (
    <div className="space-y-12">
      <section className="relative overflow-hidden rounded-3xl border border-emerald-900/40 bg-gradient-to-br from-zinc-900/95 via-zinc-950 to-emerald-950/40 p-6 shadow-2xl shadow-emerald-950/20 md:p-10">
        <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-40 w-40 rounded-full bg-lime-400/10 blur-3xl" />

        <div className="relative grid items-center gap-8 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="animate-rise-in">
            <p className="inline-flex items-center gap-2 rounded-full border border-emerald-700/40 bg-emerald-950/50 px-3 py-1 text-xs tracking-[0.14em] text-emerald-200">
              <BadgeCheck className="h-3.5 w-3.5" />
              PUBLIC DEMO READY
            </p>
            <h1 className="mt-5 max-w-4xl text-4xl font-semibold leading-tight text-white md:text-6xl">
              A premium crypto wallet, P2P escrow, and paper trading demo in one product.
            </h1>
            <p className="mt-3 text-xs font-medium uppercase tracking-[0.24em] text-emerald-300/90 md:text-sm">
              Trade Without Borders
            </p>
            <p className="mt-5 max-w-2xl text-sm leading-6 text-slate-300 md:text-base">
              Xorviqa is a portfolio-grade fintech MVP that shows secure auth, custodial wallet flows,
              P2P payment proof, real-time markets, and simulated trading without real-money brokerage execution.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/login?demo=1&next=/trades" prefetch={false}>
                <Button size="lg" className="w-full gap-2 sm:w-auto">
                  <Sparkles className="h-4 w-4" />
                  Try Demo
                </Button>
              </Link>
              <Link href="/p2p" prefetch={false}>
                <Button variant="outline" size="lg" className="w-full gap-2 sm:w-auto">
                  Explore P2P
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="/markets" prefetch={false}>
                <Button variant="ghost" size="lg" className="w-full sm:w-auto">
                  View Markets
                </Button>
              </Link>
            </div>
          </div>

          <Card className="animate-rise-in animation-delay-100 border-emerald-800/40 bg-zinc-950/75">
            <CardHeader>
              <CardTitle className="text-lg">Live Product Preview</CardTitle>
              <CardDescription>P2P desk, escrow status, and market data in one cockpit.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-2xl border border-zinc-800 bg-gradient-to-br from-emerald-950/40 to-zinc-950 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">Active trade</p>
                <p className="mt-1 text-lg font-semibold text-white">USDT/INR escrow</p>
                <p className="text-xs text-slate-400">Payment proof received. Awaiting seller release.</p>
              </div>
              {[
                { pair: "BTC/USDT", price: "$68,420.10", change: "+0.68%" },
                { pair: "ETH/USDT", price: "$3,550.40", change: "+1.02%" },
                { pair: "SOL/USDT", price: "$158.77", change: "-0.41%" },
              ].map((row) => (
                <div key={row.pair} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-2">
                  <p className="text-sm text-slate-200">{row.pair}</p>
                  <p className="text-sm font-medium text-white">{row.price}</p>
                  <p className={`text-xs ${row.change.startsWith("-") ? "text-red-300" : "text-emerald-300"}`}>{row.change}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Card className="border-emerald-800/40 bg-zinc-950/70">
          <CardHeader>
            <CardTitle className="text-xl text-white">P2P Quick Trade</CardTitle>
            <CardDescription>Find the best offers instantly with local payment rails.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="inline-flex w-full rounded-xl border border-zinc-700 bg-zinc-950/80 p-1 sm:w-auto">
              <button type="button" onClick={() => setTradeSide("BUY")} className={`rounded-lg px-5 py-2 text-sm font-medium transition ${tradeSide === "BUY" ? "bg-emerald-600 text-white" : "text-slate-300 hover:bg-zinc-900"}`}>
                Buy
              </button>
              <button type="button" onClick={() => setTradeSide("SELL")} className={`rounded-lg px-5 py-2 text-sm font-medium transition ${tradeSide === "SELL" ? "bg-red-600 text-white" : "text-slate-300 hover:bg-zinc-900"}`}>
                Sell
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <label className="space-y-1.5"><span className="text-xs uppercase tracking-[0.12em] text-slate-500">Crypto</span><select value={asset} onChange={(e) => setAsset(e.target.value)} className="h-10 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500">{quickTradeAssets.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
              <label className="space-y-1.5"><span className="text-xs uppercase tracking-[0.12em] text-slate-500">Amount</span><input value={amount} onChange={(e) => setAmount(e.target.value)} className="h-10 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500" placeholder="Enter amount" /></label>
              <label className="space-y-1.5"><span className="text-xs uppercase tracking-[0.12em] text-slate-500">Payment Method</span><select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="h-10 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500">{quickPaymentChips.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
              <label className="space-y-1.5"><span className="text-xs uppercase tracking-[0.12em] text-slate-500">Country</span><select value={country} onChange={(e) => setCountry(e.target.value)} className="h-10 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500">{quickCountries.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
            </div>

            <div className="flex flex-wrap gap-2">
              {quickPaymentChips.map((chip) => (
                <button key={chip} type="button" onClick={() => setPaymentMethod(chip)} className={`rounded-full border px-3 py-1.5 text-xs transition ${paymentMethod === chip ? "border-emerald-700/40 bg-emerald-950/50 text-emerald-200" : "border-zinc-700 bg-zinc-900/70 text-slate-300 hover:border-zinc-500"}`}>
                  {chip}
                </button>
              ))}
            </div>

            <Link href="/p2p" prefetch={false}><Button size="lg" className="gap-2">Search {tradeSide} Offers<ArrowRight className="h-4 w-4" /></Button></Link>
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-zinc-950/60">
          <CardHeader><CardTitle className="text-lg">Quick Snapshot</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm text-slate-300">
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3"><p className="text-xs uppercase tracking-wide text-slate-500">Side</p><p className={`mt-1 font-semibold ${tradeSide === "BUY" ? "text-emerald-300" : "text-red-300"}`}>{tradeSide}</p></div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3"><p className="text-xs uppercase tracking-wide text-slate-500">Pair</p><p className="mt-1 font-semibold text-white">{asset}/USDT</p></div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3"><p className="text-xs uppercase tracking-wide text-slate-500">Amount + Method</p><p className="mt-1 font-semibold text-white">{amount || "0"} via {paymentMethod}</p></div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3"><p className="text-xs uppercase tracking-wide text-slate-500">Region</p><p className="mt-1 font-semibold text-white">{country}</p></div>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        <div className="space-y-1"><p className="text-xs uppercase tracking-[0.2em] text-emerald-300">Products</p><h2 className="text-2xl font-semibold text-white md:text-3xl">Our Products</h2></div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {productCards.map((product) => {
            const Icon = product.icon;
            return (
              <Card key={product.title} className="border-zinc-800 bg-zinc-950/60 transition hover:border-emerald-700/40">
                <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Icon className="h-5 w-5 text-emerald-300" />{product.title}</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm leading-6 text-slate-300">{product.body}</p>
                  <Link href={product.href} prefetch={false}><Button variant="outline" size="sm" className="gap-2">{product.cta}<ArrowRight className="h-3.5 w-3.5" /></Button></Link>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="space-y-4">
        <div className="space-y-1"><p className="text-xs uppercase tracking-[0.2em] text-emerald-300">Trust Layer</p><h2 className="text-2xl font-semibold text-white md:text-3xl">Why Xorviqa</h2></div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {trustPoints.map((item) => {
            const Icon = item.icon;
            return (
              <Card key={item.title} className="border-zinc-800 bg-zinc-950/60">
                <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Icon className="h-5 w-5 text-emerald-300" />{item.title}</CardTitle></CardHeader>
                <CardContent><p className="text-sm leading-6 text-slate-300">{item.body}</p></CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        {trustStats.map((stat) => (
          <Card key={stat.label} className="border-emerald-900/30 bg-emerald-950/10">
            <CardHeader className="pb-2"><CardDescription>{stat.label}</CardDescription></CardHeader>
            <CardContent><p className="text-2xl font-semibold text-white">{stat.value}</p></CardContent>
          </Card>
        ))}
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><p className="text-xs uppercase tracking-[0.2em] text-emerald-300">Live Market Preview</p><h2 className="text-2xl font-semibold text-white md:text-3xl">Top Movers and Popular Pairs</h2></div>
          <p className="text-xs text-slate-400">{marketUpdatedAt ? `Last updated ${marketUpdatedAt}` : "Fetching market snapshot..."}</p>
        </div>
        {marketError ? <div className="rounded-xl border border-amber-700/40 bg-amber-950/20 px-4 py-3 text-sm text-amber-200">{marketError}</div> : null}
        <div className="grid gap-4 xl:grid-cols-4">
          {[
            { title: "Top Gainers", items: gainers },
            { title: "Top Losers", items: losers },
            { title: "Popular Pairs", items: popular },
            { title: "Trending Markets", items: trending },
          ].map((group) => (
            <Card key={group.title} className="border-zinc-800 bg-zinc-950/60">
              <CardHeader><CardTitle className="text-lg">{group.title}</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {marketLoading ? (
                  <div className="space-y-2">{[0, 1, 2].map((p) => <div key={p} className="h-12 animate-pulse rounded-xl bg-zinc-900/80" />)}</div>
                ) : group.items.length === 0 ? (
                  <p className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3 text-sm text-slate-400">Market data unavailable.</p>
                ) : (
                  group.items.map((pair) => {
                    const change = parseNumeric(pair.priceChangePercent);
                    const volume = parseNumeric(pair.quoteVolume);
                    return (
                      <div key={`${group.title}-${pair.symbol}`} className="rounded-xl border border-zinc-800 bg-zinc-950/70 px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <img
                              src={iconForSymbol(pair.symbol)}
                              alt={`${pair.symbol} icon`}
                              className="h-6 w-6 rounded-full object-contain"
                              loading="lazy"
                              onError={(event) => {
                                event.currentTarget.onerror = null;
                                event.currentTarget.src = "/icons/coin-fallback.png";
                              }}
                            />
                            <p className="text-sm font-medium text-slate-200">{pair.displaySymbol ?? toDisplayPair(pair.symbol)}</p>
                          </div>
                          <p className={`text-xs ${change >= 0 ? "text-emerald-300" : "text-red-300"}`}>{formatPercent(pair.priceChangePercent)}</p>
                        </div>
                        <div className="mt-1 flex items-center justify-between gap-2 text-xs text-slate-400"><span>{formatMarketPrice(pair.lastPrice)}</span><span>Vol {formatCompact(volume)}</span></div>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div className="space-y-1"><p className="text-xs uppercase tracking-[0.2em] text-emerald-300">Support</p><h2 className="text-2xl font-semibold text-white md:text-3xl">Support and Learning</h2></div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {supportItems.map((item) => {
            const Icon = item.icon;
            return (
              <Card key={item.title} className="border-zinc-800 bg-zinc-950/60">
                <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Icon className="h-5 w-5 text-emerald-300" />{item.title}</CardTitle></CardHeader>
                <CardContent className="space-y-4"><p className="text-sm leading-6 text-slate-300">{item.body}</p><Link href={item.href} prefetch={false}><Button variant="outline" size="sm">{item.cta}</Button></Link></CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <Card className="border-zinc-800 bg-gradient-to-br from-zinc-900/95 to-emerald-950/30">
          <CardHeader><CardTitle className="text-2xl text-white">Earn with Xorviqa</CardTitle><CardDescription>Referral, partner, and merchant opportunities in one ecosystem.</CardDescription></CardHeader>
          <CardContent className="grid gap-3">
            {partnerPrograms.map((program) => {
              const Icon = program.icon;
              return <div key={program.title} className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4"><p className="flex items-center gap-2 text-sm font-semibold text-white"><Icon className="h-4 w-4 text-emerald-300" />{program.title}</p><p className="mt-2 text-sm text-slate-300">{program.body}</p></div>;
            })}
          </CardContent>
        </Card>

        <Card className="border-emerald-800/40 bg-emerald-950/15">
          <CardHeader><CardTitle className="text-2xl text-white">Mobile App Coming Soon</CardTitle><CardDescription>Trade, settle, and manage wallet from Android and iOS.</CardDescription></CardHeader>
          <CardContent className="space-y-5">
            <div className="mx-auto w-full max-w-[250px] rounded-[2rem] border border-zinc-700 bg-zinc-950/80 p-4"><div className="rounded-[1.4rem] border border-emerald-900/40 bg-gradient-to-b from-emerald-950/30 to-zinc-950 p-3"><p className="text-xs uppercase tracking-wide text-emerald-200">Xorviqa App</p><div className="mt-3 space-y-2"><div className="h-8 rounded-lg bg-zinc-900/90" /><div className="h-8 rounded-lg bg-zinc-900/80" /><div className="h-8 rounded-lg bg-zinc-900/70" /></div></div></div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button
                variant="outline"
                className="gap-2"
                type="button"
                onClick={() => toast.info("Android app is coming soon.")}
              >
                <Smartphone className="h-4 w-4" />
                Android
              </Button>
              <Button
                variant="outline"
                className="gap-2"
                type="button"
                onClick={() => toast.info("iOS app is coming soon.")}
              >
                <Smartphone className="h-4 w-4" />
                iOS
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
        <Card className="border-emerald-900/40 bg-emerald-950/10">
          <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><MessageSquare className="h-5 w-5 text-emerald-300" />P2P Payment Flow</CardTitle><CardDescription>Clear, demo-safe escrow workflow for public walkthroughs.</CardDescription></CardHeader>
          <CardContent className="space-y-3">{workflow.map((step, i) => <div key={step} className="flex gap-3 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-emerald-600 text-xs font-semibold text-white">{i + 1}</span><p className="text-sm text-slate-300">{step}</p></div>)}</CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Bot className="h-5 w-5 text-emerald-300" />Platform Highlights</CardTitle></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {[
              "Production-minded auth with httpOnly cookies",
              "Thin controllers and service-layer business rules",
              "Ledger-first wallet accounting patterns",
              "Escrow state safety and participant permissions",
              "Real-time market data with resilient fallbacks",
              "Friendly UX for loading, errors, proofs, and disputes",
            ].map((item) => <div key={item} className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 text-sm text-slate-300">{item}</div>)}
          </CardContent>
        </Card>
      </section>

      <footer className="rounded-3xl border border-zinc-800 bg-zinc-950/70 p-6 md:p-8">
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-6">
          <div className="xl:col-span-1">
            <p className="text-2xl font-semibold text-white">Xorviqa</p>
            <p className="mt-1 text-[11px] uppercase tracking-[0.2em] text-emerald-300/85">Trade Without Borders</p>
            <p className="mt-2 text-sm text-slate-400">Premium crypto P2P ecosystem for secure global settlement.</p>
          </div>
          {footerColumns.map((column) => (
            <div key={column.heading} className="space-y-2">
              <p className="text-sm font-semibold text-white">{column.heading}</p>
              <div className="space-y-1.5">
                {column.links.map((link) =>
                  link.external ? (
                    <a
                      key={link.label}
                      href={link.href}
                      target="_blank"
                      rel="noreferrer"
                      className="block text-sm text-slate-400 transition hover:text-emerald-300"
                    >
                      {link.label}
                    </a>
                  ) : (
                    <Link
                      key={link.label}
                      href={link.href}
                      prefetch={false}
                      className="block text-sm text-slate-400 transition hover:text-emerald-300"
                    >
                      {link.label}
                    </Link>
                  ),
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-6 w-full border-t border-zinc-800/80 pt-5 text-center">
          <p className="text-xs text-slate-500">&copy; 2026 Xorviqa. All rights reserved.</p>
          <p className="mt-2 text-xs text-slate-500">
            Powered by <span className="font-medium text-slate-400">Malachite Technologies</span>
          </p>
        </div>
      </footer>
    </div>
  );
}
