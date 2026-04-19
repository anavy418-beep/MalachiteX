"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { io, Socket } from "socket.io-client";
import { Button } from "@/components/ui/button";
import { apiRequest, tokenStore } from "@/lib/api";

interface Trade {
  id: string;
  status: string;
  amountMinor: string;
  escrowHeldMinor: string;
  chat: Array<{
    id: string;
    body: string;
    senderId: string;
    createdAt: string;
  }>;
}

export default function TradePage() {
  const params = useParams<{ id: string }>();
  const tradeId = params.id;
  const [trade, setTrade] = useState<Trade | null>(null);
  const token = tokenStore.accessToken;

  const socket = useMemo<Socket | null>(() => {
    if (!token) return null;
    return io(process.env.NEXT_PUBLIC_API_SOCKET_URL ?? "http://localhost:4000", {
      auth: { token },
    });
  }, [token]);

  async function loadTrade() {
    if (!token) return;
    const payload = await apiRequest<Trade>(`/trades/${tradeId}`, { token });
    setTrade(payload);
  }

  useEffect(() => {
    loadTrade();
  }, [tradeId]);

  useEffect(() => {
    if (!socket || !tradeId) return;

    socket.emit("trade:join", { tradeId });
    socket.on("trade:chat:new", () => loadTrade());
    socket.on("trade:status:updated", () => loadTrade());

    return () => {
      socket.emit("trade:leave", { tradeId });
      socket.disconnect();
    };
  }, [socket, tradeId]);

  async function markPaid() {
    if (!token) return;
    await apiRequest(`/trades/${tradeId}/mark-paid`, { method: "POST", token });
    await loadTrade();
  }

  async function release() {
    if (!token) return;
    await apiRequest(`/trades/${tradeId}/release`, { method: "POST", token });
    await loadTrade();
  }

  async function openDispute() {
    if (!token) return;
    await apiRequest(`/disputes`, {
      method: "POST",
      token,
      body: JSON.stringify({ tradeId, reason: "Payment issue" }),
    });
    await loadTrade();
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;

    const formData = new FormData(event.currentTarget);
    await apiRequest(`/chat/trades/${tradeId}/messages`, {
      method: "POST",
      token,
      body: JSON.stringify({ body: formData.get("body") }),
    });

    (event.currentTarget as HTMLFormElement).reset();
    await loadTrade();
  }

  if (!trade) return <p>Loading trade...</p>;

  return (
    <section className="grid gap-6">
      <h1 className="text-2xl font-semibold">Trade #{trade.id.slice(0, 8)}</h1>
      <article className="rounded-lg border bg-white p-4">
        <p>Status: {trade.status}</p>
        <p>Amount: {trade.amountMinor} minor</p>
        <p>Escrow held: {trade.escrowHeldMinor} minor</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button onClick={markPaid} variant="outline">
            Mark paid
          </Button>
          <Button onClick={release}>Release escrow</Button>
          <Button onClick={openDispute} variant="ghost">
            Open dispute
          </Button>
        </div>
      </article>

      <section className="rounded-lg border bg-white p-4">
        <h2 className="text-lg font-semibold">Trade chat</h2>
        <div className="mt-3 max-h-72 space-y-2 overflow-auto rounded border p-3">
          {trade.chat.map((message) => (
            <article key={message.id} className="rounded bg-slate-100 p-2 text-sm">
              <p>{message.body}</p>
              <p className="text-xs text-slate-500">{message.senderId.slice(0, 8)}</p>
            </article>
          ))}
        </div>
        <form className="mt-3 flex gap-2" onSubmit={sendMessage}>
          <input
            name="body"
            required
            className="h-10 flex-1 rounded-md border px-3"
            placeholder="Write a message"
          />
          <Button type="submit">Send</Button>
        </form>
      </section>
    </section>
  );
}
