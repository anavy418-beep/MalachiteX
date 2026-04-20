export function LoadingState({ label = "Preparing your workspace" }: { label?: string }) {
  return (
    <div className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-950/60 p-5">
      <div className="flex items-center gap-3">
        <span className="h-3 w-3 animate-pulse rounded-full bg-emerald-400" />
        <p className="text-sm text-slate-300">{label}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="h-16 animate-pulse rounded-xl bg-zinc-900/80" />
        <div className="h-16 animate-pulse rounded-xl bg-zinc-900/70" />
        <div className="h-16 animate-pulse rounded-xl bg-zinc-900/60" />
      </div>
    </div>
  );
}
