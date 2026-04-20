"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { io } from "socket.io-client";
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  ChevronDown,
  FileImage,
  MessageSquare,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { tokenStore } from "@/lib/api";
import { formatDateTime, formatMinorUnits } from "@/lib/money";
import { normalizeTradeStatus, type CanonicalTradeStatus, tradeStatusLabel } from "@/lib/status";
import { tradesService, type TradeRecord, type TradeMessage } from "@/services/trades.service";
import { useAuth } from "@/hooks/use-auth";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingState } from "@/components/ui/loading-state";

const API_SOCKET_URL = process.env.NEXT_PUBLIC_API_SOCKET_URL ?? "";

if (!API_SOCKET_URL && process.env.NODE_ENV === "production") {
  throw new Error("NEXT_PUBLIC_API_SOCKET_URL must be configured in production.");
}

const RESOLVED_API_SOCKET_URL = API_SOCKET_URL || "http://localhost:4000";

type TradeUiStatus = CanonicalTradeStatus;

type RenderMessageKind = "system" | "user" | "counterparty" | "bot";

function mapTradeStatus(rawStatus: string): TradeUiStatus {
  return normalizeTradeStatus(rawStatus);
}

function statusBadge(uiStatus: TradeUiStatus) {
  if (uiStatus === "COMPLETED") return "border-emerald-700/50 bg-emerald-950/40 text-emerald-200";
  if (uiStatus === "PAYMENT_SENT" || uiStatus === "RELEASE_PENDING")
    return "border-lime-700/50 bg-lime-950/40 text-lime-200";
  if (uiStatus === "DISPUTED") return "border-amber-700/50 bg-amber-950/40 text-amber-200";
  if (uiStatus === "CANCELLED") return "border-red-700/50 bg-red-950/40 text-red-200";
  return "border-zinc-700/60 bg-zinc-900/60 text-slate-300";
}

function inferChatKind(message: TradeMessage, currentUserId?: string): RenderMessageKind {
  if (message.senderId === "__SYSTEM__" || message.body.startsWith("[System]")) return "system";
  if (message.body.startsWith("[Demo Bot]") || message.body.startsWith("[Trade Assistant]")) return "bot";
  if (message.senderId === currentUserId) return "user";
  return "counterparty";
}

function cleanBody(message: TradeMessage) {
  if (message.body.startsWith("[Demo Bot]")) {
    return message.body.replace("[Demo Bot]", "").trim();
  }
  if (message.body.startsWith("[Trade Assistant]")) {
    return message.body.replace("[Trade Assistant]", "").trim();
  }
  if (message.body.startsWith("[System]")) {
    return message.body.replace("[System]", "").trim();
  }
  return message.body;
}

function messageLabel(kind: RenderMessageKind, trade: TradeRecord, message: TradeMessage, currentUserId?: string) {
  if (kind === "system") return "System";
  if (kind === "bot") return "Trade Assistant";
  if (kind === "user") return "You";
  if (message.senderId === trade.buyerId) return "Buyer";
  if (message.senderId === trade.sellerId) return "Seller";
  return "Counterparty";
}

function stepIndexForStatus(uiStatus: TradeUiStatus) {
  if (uiStatus === "CANCELLED") return 0;
  if (uiStatus === "DISPUTED") return 1;
  if (uiStatus === "COMPLETED") return 3;
  if (uiStatus === "RELEASE_PENDING") return 2;
  if (uiStatus === "PAYMENT_SENT") return 1;
  return 0;
}

function paymentValue(value: string | null | undefined) {
  return value && value.trim().length > 0 ? value : "Not provided";
}

function statusSummary(uiStatus: TradeUiStatus) {
  if (uiStatus === "PAYMENT_PENDING") return "Buyer still needs to submit payment proof.";
  if (uiStatus === "PAYMENT_SENT") return "Payment proof submitted. Seller verification is required.";
  if (uiStatus === "RELEASE_PENDING") return "Payment acknowledged. Escrow release is pending settlement.";
  if (uiStatus === "COMPLETED") return "Escrow released and trade settled.";
  if (uiStatus === "CANCELLED") return "Trade cancelled and escrow refunded to seller.";
  if (uiStatus === "DISPUTED") return "Dispute opened. Resolution will follow dispute review flow.";
  return "Trade status available.";
}

function parseDisputeEvidence(evidenceKeys: string[]) {
  const paymentReferences: string[] = [];
  const proofFiles: string[] = [];
  const proofUrls: string[] = [];
  const other: string[] = [];

  evidenceKeys.forEach((entry) => {
    if (entry.startsWith("payment-reference:")) {
      paymentReferences.push(entry.replace("payment-reference:", ""));
      return;
    }
    if (entry.startsWith("mock-dispute-proof:")) {
      proofFiles.push(entry.replace("mock-dispute-proof:", ""));
      return;
    }
    if (entry.startsWith("proof-url:")) {
      proofUrls.push(entry.replace("proof-url:", ""));
      return;
    }
    other.push(entry);
  });

  return {
    paymentReferences,
    proofFiles,
    proofUrls,
    other,
  };
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
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentProofFile, setPaymentProofFile] = useState<File | null>(null);
  const [paymentProofUrl, setPaymentProofUrl] = useState("");
  const [disputeReason, setDisputeReason] = useState("Payment confirmation mismatch.");
  const [disputeReference, setDisputeReference] = useState("");
  const [disputeProofFile, setDisputeProofFile] = useState<File | null>(null);
  const [disputeProofUrl, setDisputeProofUrl] = useState("");

  const token = tokenStore.accessToken;
  const uiStatus = mapTradeStatus(trade?.status ?? "OPEN");

  const isBuyer = !!trade && user?.id === trade.buyerId;
  const isSeller = !!trade && user?.id === trade.sellerId;
  const hasPaymentProofInput =
    paymentReference.trim().length > 0 ||
    paymentProofUrl.trim().length > 0 ||
    Boolean(paymentProofFile);
  const canMarkPaid = uiStatus === "PAYMENT_PENDING" && isBuyer && hasPaymentProofInput;
  const canRelease = uiStatus === "PAYMENT_SENT" && isSeller && Boolean(trade?.paymentProof);
  const canCancel = uiStatus === "PAYMENT_PENDING" && !!trade && (isBuyer || isSeller);
  const canDispute =
    !!trade &&
    (isBuyer || isSeller) &&
    (uiStatus === "PAYMENT_PENDING" || uiStatus === "PAYMENT_SENT" || uiStatus === "RELEASE_PENDING");
  const markPaidDisabledReason = !isBuyer
    ? "Only buyer can mark payment as sent."
    : uiStatus !== "PAYMENT_PENDING"
      ? "Payment proof can be submitted only while payment is pending."
      : !hasPaymentProofInput
        ? "Add reference ID or proof before marking payment."
        : null;
  const releaseDisabledReason = !isSeller
    ? "Only seller can release escrow."
    : uiStatus !== "PAYMENT_SENT"
      ? "Escrow release is available after payment is submitted."
      : !trade?.paymentProof
        ? "Payment proof must be available before release."
        : null;
  const cancelDisabledReason =
    !trade || !(isBuyer || isSeller)
      ? "Only trade participants can cancel."
      : uiStatus !== "PAYMENT_PENDING"
        ? "Cancel is available only before payment is sent."
        : null;
  const disputeDisabledReason = !canDispute
    ? "Dispute is available during payment and release stages."
    : null;

  const socket = useMemo<any>(() => {
    if (!token) return null;

    return io(RESOLVED_API_SOCKET_URL, {
      auth: { token },
    });
  }, [token]);

  async function loadTrade() {
    if (!token) {
      setError("Please sign in to open this P2P trade workspace.");
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
      await tradesService.markPaid(token, trade.id, {
        paymentReference,
        proofFileName: paymentProofFile?.name,
        proofMimeType: paymentProofFile?.type,
        proofUrl: paymentProofUrl || undefined,
      });
      setPaymentReference("");
      setPaymentProofFile(null);
      setPaymentProofUrl("");
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
      await tradesService.openDispute(token, trade.id, disputeReason, {
        paymentReference: disputeReference || trade.paymentProof?.paymentReference || undefined,
        proofFileName: disputeProofFile?.name,
        proofUrl: disputeProofUrl || undefined,
        evidenceKeys: trade.paymentProof?.proofUrl ? [trade.paymentProof.proofUrl] : undefined,
      });
      setDisputeProofFile(null);
      setDisputeProofUrl("");
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

  async function runTradeAssistant() {
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
        body: "[System] Escrow is active. Keep all payment references, proof, and release confirmations inside this P2P trade.",
        createdAt: trade.createdAt ?? new Date().toISOString(),
      },
    ];

    return [...system, ...messages];
  }, [trade, messages]);

  if (loading) {
    return <LoadingState label="Opening trade workspace" />;
  }

  if (!trade) {
    return (
      <section className="space-y-3">
        <h1 className="text-2xl font-semibold text-white">Trade Not Available</h1>
        <p className="text-sm text-slate-400">
          This trade workspace is not available for the current session.
        </p>
        {error ? <Alert variant="error">{error}</Alert> : null}
      </section>
    );
  }

  const counterpartyId = isBuyer ? trade.sellerId : trade.buyerId;
  const merchantLabel = `Trader ${counterpartyId.slice(0, 6).toUpperCase()}`;
  const paymentMethod = trade.offer?.paymentMethod ?? "Bank Transfer";
  const paymentInstructions = trade.paymentInstructions ?? trade.offer?.paymentDetails ?? {};
  const paymentProof = trade.paymentProof;
  const settlementAsset = trade.offer?.asset ?? "USDT";
  const fiatCurrency = paymentInstructions.fiatCurrency ?? trade.offer?.fiatCurrency ?? "INR";
  const offerTerms =
    trade.offer?.terms?.trim() ||
    "Only release after confirmed payment in your account. Keep proof in chat for disputes.";
  const tradeLimits =
    trade.offer?.minAmountMinor && trade.offer?.maxAmountMinor
      ? `${formatMinorUnits(trade.offer.minAmountMinor, fiatCurrency)} - ${formatMinorUnits(
          trade.offer.maxAmountMinor,
          fiatCurrency,
        )}`
      : "Offer limits available in offer details";
  const statusStepIndex = stepIndexForStatus(uiStatus);
  const disputeEvidence = trade.dispute ? parseDisputeEvidence(trade.dispute.evidenceKeys) : null;

  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.2em] text-emerald-300">Trade Workspace</p>
        <h1 className="text-3xl font-semibold text-white">Trade {trade.id.slice(0, 12)}</h1>
        <div className="flex items-center gap-2">
          <span className={`inline-flex rounded-full border px-2 py-1 text-xs ${statusBadge(uiStatus)}`}>
            {tradeStatusLabel(uiStatus)}
          </span>
        </div>
        <p className="text-sm text-slate-400">{statusSummary(uiStatus)}</p>
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
              {!canMarkPaid && markPaidDisabledReason ? (
                <p className="text-xs text-slate-500">{markPaidDisabledReason}</p>
              ) : null}
              <Button onClick={handleRelease} disabled={!canRelease || submitting} className="w-full">
                Release Crypto
              </Button>
              {!canRelease && releaseDisabledReason ? (
                <p className="text-xs text-slate-500">{releaseDisabledReason}</p>
              ) : null}
              <Button onClick={handleCancel} disabled={!canCancel || submitting} variant="outline" className="w-full">
                Cancel Trade
              </Button>
              {!canCancel && cancelDisabledReason ? (
                <p className="text-xs text-slate-500">{cancelDisabledReason}</p>
              ) : null}
              {canDispute ? (
                <div className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
                  <label className="grid gap-1 text-xs uppercase tracking-wide text-slate-500">
                    Dispute reason
                    <textarea
                      value={disputeReason}
                      onChange={(event) => setDisputeReason(event.target.value)}
                      className="min-h-20 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm normal-case text-slate-100 outline-none ring-emerald-500 focus:ring-2"
                    />
                  </label>
                  <label className="grid gap-1 text-xs uppercase tracking-wide text-slate-500">
                    Evidence reference
                    <input
                      value={disputeReference}
                      onChange={(event) => setDisputeReference(event.target.value)}
                      className="h-9 rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm normal-case text-slate-100 outline-none ring-emerald-500 focus:ring-2"
                      placeholder="Optional"
                    />
                  </label>
                  <label className="grid gap-1 text-xs uppercase tracking-wide text-slate-500">
                    Evidence file
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      onChange={(event) => setDisputeProofFile(event.target.files?.[0] ?? null)}
                      className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm normal-case text-slate-100"
                    />
                  </label>
                  <label className="grid gap-1 text-xs uppercase tracking-wide text-slate-500">
                    Evidence URL
                    <input
                      value={disputeProofUrl}
                      onChange={(event) => setDisputeProofUrl(event.target.value)}
                      className="h-9 rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm normal-case text-slate-100 outline-none ring-emerald-500 focus:ring-2"
                      placeholder="Optional proof link"
                    />
                  </label>
                </div>
              ) : null}
              <Button onClick={handleDispute} disabled={!canDispute || submitting} variant="outline" className="w-full">
                <ShieldAlert className="mr-2 h-4 w-4" />
                Open Dispute
              </Button>
              {!canDispute && disputeDisabledReason ? (
                <p className="text-xs text-slate-500">{disputeDisabledReason}</p>
              ) : null}
            </CardContent>
          </Card>

          {isSeller && uiStatus === "PAYMENT_SENT" ? (
            <Card className="border-lime-800/40 bg-lime-950/20">
              <CardHeader>
                <CardTitle className="text-lg">Seller Verification</CardTitle>
                <CardDescription>Buyer marked payment as sent. Confirm funds before release.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-lime-100">
                <p>1. Check your bank/UPI app for incoming funds.</p>
                <p>2. Match amount and payment reference in this workspace.</p>
                <p>3. Release only after your own account confirms settlement.</p>
              </CardContent>
            </Card>
          ) : null}

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
                Receiver:{" "}
                <span className="font-semibold text-slate-100">
                  {paymentValue(paymentInstructions.receiverName)}
                </span>
              </p>
              <p>
                UPI ID:{" "}
                <span className="font-semibold text-slate-100">{paymentValue(paymentInstructions.upiId)}</span>
              </p>
              <p>
                Bank:{" "}
                <span className="font-semibold text-slate-100">
                  {paymentValue(paymentInstructions.bankName)}
                </span>
              </p>
              <p>
                Account / IFSC:{" "}
                <span className="font-semibold text-slate-100">
                  {paymentValue(paymentInstructions.accountNumber)} / {paymentValue(paymentInstructions.ifsc)}
                </span>
              </p>
              <p>
                Asset to receive:{" "}
                <span className="font-semibold text-emerald-300">
                  {formatMinorUnits(trade.amountMinor, settlementAsset)}
                </span>
              </p>
              {paymentInstructions.note ? (
                <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-2 text-xs text-slate-300">
                  Note: {paymentInstructions.note}
                </div>
              ) : null}
              <div className="rounded-lg border border-emerald-800/30 bg-emerald-950/20 p-2 text-xs text-emerald-200">
                Escrow protection: seller should verify payment in their own account before release.
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Payment Proof</CardTitle>
              <CardDescription>Buyer must attach a reference or screenshot before marking paid.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-300">
              {paymentProof ? (
                <div className="rounded-lg border border-lime-800/40 bg-lime-950/20 p-3">
                  <p className="font-medium text-lime-200">Proof submitted</p>
                  <p className="mt-1">Reference: {paymentValue(paymentProof.paymentReference)}</p>
                  <p>File: {paymentValue(paymentProof.proofFileName)}</p>
                  <p>Stored at: {paymentValue(paymentProof.proofUrl)}</p>
                  <p>Submitted: {paymentProof.uploadedAt ? formatDateTime(paymentProof.uploadedAt) : "Not provided"}</p>
                </div>
              ) : null}

              {isSeller && uiStatus === "PAYMENT_SENT" && !paymentProof ? (
                <div className="rounded-lg border border-amber-800/40 bg-amber-950/20 p-3 text-amber-100">
                  Buyer marked payment as sent, but proof details are missing. Ask buyer to update reference/proof before release.
                </div>
              ) : null}

              {isBuyer && uiStatus === "PAYMENT_PENDING" ? (
                <div className="space-y-3">
                  <label className="grid gap-1 text-xs uppercase tracking-wide text-slate-500">
                    Payment reference / UTR
                    <input
                      value={paymentReference}
                      onChange={(event) => setPaymentReference(event.target.value)}
                      className="h-10 rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm normal-case text-slate-100 outline-none ring-emerald-500 focus:ring-2"
                      placeholder="UPI ref, UTR, bank reference"
                    />
                  </label>
                  <label className="grid gap-1 text-xs uppercase tracking-wide text-slate-500">
                    Screenshot
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      onChange={(event) => setPaymentProofFile(event.target.files?.[0] ?? null)}
                      className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm normal-case text-slate-100"
                    />
                  </label>
                  <label className="grid gap-1 text-xs uppercase tracking-wide text-slate-500">
                    Proof URL
                    <input
                      value={paymentProofUrl}
                      onChange={(event) => setPaymentProofUrl(event.target.value)}
                      className="h-10 rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm normal-case text-slate-100 outline-none ring-emerald-500 focus:ring-2"
                      placeholder="Optional link to payment proof"
                    />
                  </label>
                  {paymentProofFile ? (
                    <div className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950/60 p-2 text-xs text-slate-300">
                      <FileImage className="h-4 w-4 text-emerald-300" />
                      {paymentProofFile.name}
                    </div>
                  ) : null}
                </div>
              ) : null}
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
              <p>Payment window: 15 minutes (staging default)</p>
              <p>Merchant completion: 98.4% (staging baseline)</p>
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
                {["Payment Pending", "Payment Sent", "Release Pending", "Completed"].map((step, index) => {
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

          {trade.dispute ? (
            <Card className="border-amber-800/40 bg-amber-950/20">
              <CardHeader>
                <CardTitle className="text-lg">Dispute Review</CardTitle>
                <CardDescription>Both sides can reference payment instructions, proof, and chat history.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-amber-100">
                <p>Status: {trade.dispute.status.replace(/_/g, " ")}</p>
                <p>Reason: {trade.dispute.reason}</p>
                <p>Opened by: {trade.dispute.openedById === trade.buyerId ? "Buyer" : "Seller"}</p>
                <p>Opened at: {formatDateTime(trade.dispute.createdAt)}</p>
                {trade.dispute.resolvedAt ? (
                  <p>Resolved at: {formatDateTime(trade.dispute.resolvedAt)}</p>
                ) : null}
                {trade.dispute.resolvedById ? (
                  <p>Resolved by: {trade.dispute.resolvedById === trade.buyerId ? "Buyer" : trade.dispute.resolvedById === trade.sellerId ? "Seller" : "Admin"}</p>
                ) : null}
                {trade.dispute.resolutionNote ? <p>Resolution: {trade.dispute.resolutionNote}</p> : null}

                <div className="mt-3 rounded-lg border border-amber-800/40 bg-amber-950/30 p-3">
                  <p className="text-xs uppercase tracking-wide text-amber-300">Dispute Evidence</p>
                  <div className="mt-2 space-y-1 text-xs text-amber-100">
                    <p>
                      References:{" "}
                      {disputeEvidence && disputeEvidence.paymentReferences.length > 0
                        ? disputeEvidence.paymentReferences.join(", ")
                        : "None"}
                    </p>
                    <p>
                      Files:{" "}
                      {disputeEvidence && disputeEvidence.proofFiles.length > 0
                        ? disputeEvidence.proofFiles.join(", ")
                        : "None"}
                    </p>
                    <p>
                      URLs:{" "}
                      {disputeEvidence && disputeEvidence.proofUrls.length > 0
                        ? disputeEvidence.proofUrls.join(", ")
                        : "None"}
                    </p>
                    <p>
                      Other:{" "}
                      {disputeEvidence && disputeEvidence.other.length > 0
                        ? disputeEvidence.other.join(", ")
                        : "None"}
                    </p>
                  </div>
                </div>

                <div className="rounded-lg border border-amber-800/30 bg-zinc-950/50 p-3 text-xs text-amber-100">
                  <p className="uppercase tracking-wide text-amber-300">Payment Submission Evidence</p>
                  <p className="mt-2">Reference: {paymentValue(trade.paymentProof?.paymentReference)}</p>
                  <p>Proof file: {paymentValue(trade.paymentProof?.proofFileName)}</p>
                  <p>Proof URL: {paymentValue(trade.paymentProof?.proofUrl)}</p>
                </div>
              </CardContent>
            </Card>
          ) : null}

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
              <CardDescription>P2P-only conversation with payment references, proof updates, and safety reminders.</CardDescription>
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
                      {message.attachmentKey ? (
                        <p className="mt-2 rounded-md border border-zinc-700/60 bg-zinc-950/50 px-2 py-1 text-xs text-slate-400">
                          Attachment: {message.attachmentKey}
                        </p>
                      ) : null}
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

              <Button type="button" variant="outline" className="gap-2" onClick={runTradeAssistant} disabled={submitting}>
                <Bot className="h-4 w-4" />
                Ask Trade Assistant
              </Button>
            </CardContent>
          </Card>
        </main>
      </div>

      <p className="flex items-center gap-1 text-xs text-slate-500">
        <AlertCircle className="h-3.5 w-3.5" />
        P2P reminder: only release escrow after payment is confirmed in your own account.
      </p>
    </section>
  );
}
