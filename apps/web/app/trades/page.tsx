import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function TradesPage() {
  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.2em] text-emerald-300">Trades</p>
        <h1 className="text-3xl font-semibold text-white">My Trades</h1>
        <p className="text-sm text-slate-400">Open your active trade details and lifecycle status.</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">No active trade selected</CardTitle>
          <CardDescription>
            Select a trade from offers flow to open detailed messaging and status timeline.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Link href="/offers">
            <Button>Browse P2P Offers</Button>
          </Link>
          <Link href="/dashboard">
            <Button variant="outline">Back to Dashboard</Button>
          </Link>
        </CardContent>
      </Card>
    </section>
  );
}
