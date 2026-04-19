"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { io, type Socket } from "socket.io-client";
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  ChevronDown,
  MessageSquare,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { tokenStore } from "@/lib/api";
import { formatDateTime, formatMinorUnits } from "@/lib/money";
import { tradesService, type TradeRecord, type TradeMessage } from "@/services/trades.service";
import { useAuth } from "@/hooks/use-auth";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type TradeUiStatus =
  | "OPEN"
  | "PAYMENT_PENDING"
  | "PAYMENT_SENT"
  | "RELEASE_PENDING"
  | "COMPLETED"
  | "CANCELLED"
  | "DISPUTED";

type RenderMessageKind = "system" | "user" | "counterparty" | "bot";

function mapTradeStatus(rawStatus: string): TradeUiStatus {
  const normalized = rawStatus.toUpperCase();

  if (normalized === "OPEN") return "OPEN";
  if (normalized === "PAYMENT_PENDING" || normalized === "PENDING_PAYMENT") return "PAYMENT_PENDING";
  if (normalized === "PAYMENT_SENT" || normalized === "PAID") return "PAYMENT_SENT";
  if (normalized === "RELEASE_PENDING") return "RELEASE_PENDING";
  if (normalized === "COMPLETED" || normalized.includes("RELEASE")) return "COMPLETED";
  if (normalized.includes("CANCEL")) return "CANCELLED";
  if (normalized.includes("DISPUT")) return "DISPUTED";
  return "PAYMENT_PENDING";
}

function statusBadge(uiStatus: TradeUiStatus) {
  if (uiStatus === "COMPLETED") return "border-emerald-700/50 bg-emerald-950/40 text-emerald-200";
  if (uiStatus === "PAYMENT_SENT" || uiStatus === "RELEASE_PENDING")
    return "border-lime-700/50 bg-lime-950/40 text-lime-200";
  if (uiStatus === "DISPUTED") return "border-amber-700/50 bg-amber-950/40 text-amber-200";
  if (uiStatus === "CANCELLED") return "border-red-700/50 bg-red-950/40 text-red-200";
  return "border-zinc-700/60 bg-zinc-900/60 text-slate-300";
}

function uiStatusLabel(uiStatus: TradeUiStatus) {
  if (uiStatus === "PAYMENT_PENDING") return "PAYMENT_PENDING";
  if (uiStatus === "PAYMENT_SENT") return "PAYMENT_SENT";
  if (uiStatus === "RELEASE_PENDING") return "RELEASE_PENDING";
  if (uiStatus === "COMPLETED") return "COMPLETED";
  if (uiStatus === "CANCELLED") return "CANCELLED";
  if (uiStatus === "DISPUTED") return "DISPUTED";
  return "OPEN";
}

function inferChatKind(message: TradeMessage, currentUserId?: string): RenderMessageKind {
  if (message.senderId === "__SYSTEM__" || message.body.startsWith("[System]")) return "system";
  if (message.body.startsWith("[Demo Bot]")) return "bot";
  if (message.senderId === currentUserId) return "user";
  return "counterparty";
}

function cleanBody(message: TradeMessage) {
  if (message.body.startsWith("[Demo Bot]")) {
    return message.body.replace("[Demo Bot]", "").trim();
  }
  if (message.body.startsWith("[System]")) {
    return message.body.replace("[System]", "").trim();
  }
  return message.body;
}

function messageLabel(kind: RenderMessageKind, trade: TradeRecord, message: TradeMessage, currentUserId?: string) {
  if (kind === "system") return "System";
  if (kind === "bot") return "Demo Assistant";
  if (kind === "user") return "You";
  if (message.senderId === trade.buyerId) return "Buyer";
  if (message.senderId === trade.sellerId) return "Seller";
  return "Counterparty";
}

function stepIndexForStatus(uiStatus: TradeUiStatus) {
  if (uiStatus === "CANCELLED" || uiStatus === "DISPUTED") return 1;
  if (uiStatus === "COMPLETED") return 3;
  if (uiStatus === "PAYMENT_SENT" || uiStatus === "RELEASE_PENDING") return 2;
  if (uiStatus === "PAYMENT_PENDING") return 1;
  return 0;
}

export default function TradePage() {
  const params = useParams<{ id: string }>();
  const tradeId = params.id;
  const { user } = useAuth();

  const [trade, setTrade] = useState<TradeRecord | null>(null);
  const [messages, setMessages] = useState<TradeMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const token = tokenStore.accessToken;
  const uiStatus = mapTradeStatus(trade?.status ?? "OPEN");

  const isBuyer = !!trade && user?.id === trade.buyerId;
  const isSeller = !!trade && user?.id === trade.sellerId;
  const canMarkPaid = (uiStatus === "OPEN" || uiStatus === "PAYMENT_PENDING") && isBuyer;
  const canRelease = uiStatus === "PAYMENT_SENT" && isSeller;
  const canCancel = (uiStatus === "OPEN" || uiStatus === "PAYMENT_PENDING") && !!trade && (isBuyer || isSeller);
  const canDispute =
    !!trade &&
    (uiStatus === "PAYMENT_PENDING" || uiStatus === "PAYMENT_SENT" || uiStatus === "RELEASE_PENDING");

  const socket = useMemo<Socket | null>(() => {
    if (!token) return null;

    return io(process.env.NEXT_PUBLIC_API_SOCKET_URL ?? "http://localhost:4000", {
      auth: { token },
    });
  }, [token]);

  async function loadTrade() {
    if (!token) {
      setError("Session token missing.");
      setLoading(false);
      return;
    }

    try {
      const payload = await tradesService.getById(token, tradeId);
      setTrade(payload);

      if (payload.chat) {
        setMessages(payload.chat);
      } else {
        const chat = await tradesService.listMessages(token, tradeId);
        setMessages(chat);
      }

      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadTrade();
  }, [tradeId]);

  useEffect(() => {
    if (!socket || !tradeId) return;

    socket.emit("trade:join", { tradeId });
    socket.on("trade:chat:new", () => void loadTrade());
    socket.on("trade:status:updated", () => void loadTrade());

    return () => {
      socket.emit("trade:leave", { tradeId });
      socket.disconnect();
    };
  }, [socket, tradeId]);

  async function handleMarkPaid() {
    if (!token || !trade) return;
    setSubmitting(true);
    setError(null);

    try {
      await tradesService.markPaid(token, trade.id);
      await loadTrade();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRelease() {
    if (!token || !trade) return;
    setSubmitting(true);
    setError(null);

    try {
      await tradesService.release(token, trade.id);
      await loadTrade();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancel() {
    if (!token || !trade) return;
    setSubmitting(true);
    setError(null);

    try {
      await tradesService.cancel(token, trade.id);
      await loadTrade();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDispute() {
    if (!token || !trade) return;
    setSubmitting(true);
    setError(null);

    try {
      await tradesService.openDispute(token, trade.id, "Demo dispute: payment confirmation mismatch.");
      await loadTrade();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !trade) return;

    const formData = new FormData(event.currentTarget);
    const body = String(formData.get("body") ?? "").trim();

    if (!body) return;

    setSubmitting(true);
    setError(null);

    try {
      await tradesService.sendMessage(token, trade.id, body);
      (event.currentTarget as HTMLFormElement).reset();
      await loadTrade();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function runDemoBot() {
    if (!token || !trade) return;

    setSubmitting(true);
    setError(null);

    try {
      await tradesService.sendMessage(token, trade.id, "status update");
      await loadTrade();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  const renderMessages = useMemo(() => {
    if (!trade) return [] as TradeMessage[];

    const system: TradeMessage[] = [
      {
        id: `sys-${trade.id}`,
        tradeId: trade.id,
        senderId: "__SYSTEM__",
        body: "[System] Escrow is active. Keep all communication and payment proof inside this trade.",
        createdAt: trade.createdAt ?? new Date().toISOString(),
      },
    ];

    return [...system, ...messages];
  }, [trade, messages]);

  if (loading) {
    return <p className="text-sm text-slate-400">Loading trade workspace...</p>;
  }

  if (!trade) {
    return (
      <section className="space-y-3">
        <h1 className="text-2xl font-semibold text-white">Trade Not Available</h1>
        <p className="text-sm text-slate-400">Unable to load this trade.</p>
        {error ? <Alert variant="error">{error}</Alert> : null}
      </section>
    );
  }

  const counterpartyId = isBuyer ? trade.sellerId : trade.buyerId;
  const merchantLabel = `Trader ${counterpartyId.slice(0, 6).toUpperCase()}`;
  const paymentMethod = trade.offer?.paymentMethod ?? "Bank Transfer";
  const settlementAsset = trade.offer?.asset ?? "USDT";
  const fiatCurrency = trade.offer?.fiatCurrency ?? "INR";
  const offerTerms =
    trade.offer?.terms?.trim() ||
    "Only release after confirmed payment in your account. Keep proof in chat for disputes.";
  const tradeLimits =
    trade.offer?.minAmountMinor && trade.offer?.maxAmountMinor
      ? `${formatMinorUnits(trade.offer.minAmountMinor, fiatCurrency)} - ${formatMinorUnits(
          trade.offer.maxAmountMinor,
          fiatCurrency,
        )}`
      : "Demo limits available in offer";
  const statusStepIndex = stepIndexForStatus(uiStatus);

  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.2em] text-emerald-300">Trade Workspace</p>
        <h1 className="text-3xl font-semibold text-white">Trade {trade.id.slice(0, 12)}</h1>
        <div className="flex items-center gap-2">
          <span className={`inline-flex rounded-full border px-2 py-1 text-xs ${statusBadge(uiStatus)}`}>
            {uiStatusLabel(uiStatus)}
          </span>
        </div>
      </header>

      {error ? <Alert variant="error">{error}</Alert> : null}

      <div className="grid gap-4 xl:grid-cols-[340px_1fr]">
        <aside className="space-y-4 xl:sticky xl:top-20 xl:self-start">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Trade Actions</CardTitle>
              <CardDescription>Context-aware controls based on current status and role.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button onClick={handleMarkPaid} disabled={!canMarkPaid || submitting} variant="outline" className="w-full">
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Mark as Paid
              </Button>
              <Button onClick={handleRelease} disabled={!canRelease || submitting} className="w-full">
                Release Crypto
              </Button>
              <Button onClick={handleCancel} disabled={!canCancel || submitting} variant="outline" className="w-full">
                Cancel Trade
              </Button>
              <Button onClick={handleDispute} disabled={!canDispute || submitting} variant="outline" className="w-full">
                <ShieldAlert className="mr-2 h-4 w-4" />
                Open Dispute
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Payment Instructions</CardTitle>
              <CardDescription>Follow these details before confirming payment.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-slate-300">
              <p>
                Amount to pay:{" "}
                <span className="font-semibold text-slate-100">{formatMinorUnits(trade.fiatTotalMinor, fiatCurrency)}</span>
              </p>
              <p>
                Payment method: <span className="font-semibold text-slate-100">{paymentMethod}</span>
              </p>
              <p>
                Asset to receive:{" "}
                <span className="font-semibold text-emerald-300">
                  {formatMinorUnits(trade.amountMinor, settlementAsset)}
                </span>
              </p>
              <div className="rounded-lg border border-emerald-800/30 bg-emerald-950/20 p-2 text-xs text-emerald-200">
                Escrow protection: funds are held in-platform and released only after payment confirmation.
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Offer Terms</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-slate-300">{offerTerms}</p>
            </CardContent>
          </Card>

          <details className="group rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
            <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium text-slate-100">
              Trade Information
              <ChevronDown className="h-4 w-4 transition group-open:rotate-180" />
            </summary>
            <div className="mt-3 space-y-2 text-xs text-slate-400">
              <p>Trade ID: {trade.id}</p>
              <p>Offer ID: {trade.offerId}</p>
              <p>Settlement asset: {settlementAsset}</p>
              <p>Created: {trade.createdAt ? formatDateTime(trade.createdAt) : "-"}</p>
              <p>Payment window: 15 minutes (demo)</p>
              <p>Merchant completion: 98.4% (demo)</p>
              <p>Trade limits: {tradeLimits}</p>
              <p>Payment method: {paymentMethod}</p>
            </div>
          </details>
        </aside>

        <main className="space-y-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-400">Counterparty</p>
                  <p className="text-lg font-semibold text-white">{merchantLabel}</p>
                  <p className="text-xs text-slate-500">Completion 98.4% | 624 trades | ~2m response</p>
                </div>
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 px-3 py-2 text-right">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Escrow Held</p>
                  <p className="text-sm font-semibold text-emerald-300">
                    {formatMinorUnits(trade.escrowHeldMinor, settlementAsset)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="grid gap-2 md:grid-cols-4">
                {["Trade started", "Payment sent", "Awaiting release", "Completed"].map((step, index) => {
                  const complete = index <= statusStepIndex;
                  return (
                    <div
                      key={step}
                      className={`rounded-lg border px-3 py-2 text-xs ${
                        complete
                          ? "border-emerald-700/40 bg-emerald-500/10 text-emerald-200"
                          : "border-zinc-800 bg-zinc-900/60 text-slate-500"
                      }`}
                    >
                      {step}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card className="border-emerald-900/30 bg-emerald-950/10">
            <CardContent className="pt-6">
              <p className="text-sm text-emerald-100">
                Escrow guidance: confirm incoming payment in your own account before any release action.
              </p>
            </CardContent>
          </Card>

          <Card className="border-zinc-800 bg-zinc-950/60">
            <CardContent className="pt-6">
              <p className="flex items-center gap-2 text-xs text-slate-400">
                <ShieldCheck className="h-4 w-4 text-emerald-300" />
                Safety reminder: keep payment and communication on-platform. Use dispute if anything looks suspicious.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <MessageSquare className="h-5 w-5 text-emerald-300" />
                Trade Chat
              </CardTitle>
              <CardDescription>System updates, participant chat, and deterministic demo assistant replies.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="max-h-[30rem] space-y-2 overflow-auto rounded-xl border border-zinc-800 bg-zinc-950/50 p-3">
                {renderMessages.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-zinc-700 px-3 py-4 text-sm text-slate-500">
                    No messages yet. Start with payment confirmation or a quick hello.
                  </p>
                ) : null}

                {renderMessages.map((message) => {
                  const kind = inferChatKind(message, user?.id);
                  const sender = messageLabel(kind, trade, message, user?.id);
                  const bubbleTone =
                    kind === "system"
                      ? "border-blue-800/40 bg-blue-950/20 text-blue-100"
                      : kind === "bot"
                        ? "border-emerald-800/50 bg-emerald-950/25 text-emerald-100"
                        : kind === "user"
                          ? "border-zinc-700 bg-zinc-900 text-slate-100"
                          : "border-zinc-800 bg-zinc-900/60 text-slate-200";

                  return (
                    <article key={message.id} className={`rounded-lg border p-3 ${bubbleTone}`}>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="font-medium">{sender}</span>
                        <span className="text-slate-500">{formatDateTime(message.createdAt)}</span>
                      </div>
                      <p className="text-sm">{cleanBody(message)}</p>
                    </article>
                  );
                })}
              </div>

              <form className="flex gap-2" onSubmit={sendMessage}>
                <input
                  name="body"
                  required
                  className="h-10 flex-1 rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm text-slate-100 outline-none ring-emerald-500 placeholder:text-slate-500 focus:ring-2"
                  placeholder="Write a message"
                />
                <Button type="submit" disabled={submitting}>
                  Send
                </Button>
              </form>

              <Button type="button" variant="outline" className="gap-2" onClick={runDemoBot} disabled={submitting}>
                <Bot className="h-4 w-4" />
                Trigger Demo Assistant
              </Button>
            </CardContent>
          </Card>
        </main>
      </div>

      <p className="flex items-center gap-1 text-xs text-slate-500">
        <AlertCircle className="h-3.5 w-3.5" />
        Demo assistant is deterministic and intended for staging/testing only.
      </p>
    </section>
  );
}
