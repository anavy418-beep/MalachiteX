"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Sparkles, UserCircle2 } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const navLinks = [
  { href: "/", label: "Home" },
  { href: "/markets", label: "Live Market" },
  { href: "/demo-trading", label: "Trade" },
  { href: "/wallet", label: "Wallet" },
  { href: "/p2p", label: "P2P" },
  { href: "/dashboard", label: "Dashboard" },
];

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isAuthenticated, isBootstrapping, logout } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  async function handleLogout() {
    setIsLoggingOut(true);

    try {
      await logout();
    } catch (error) {
      console.error("Logout failed", error);
    } finally {
      router.replace("/login");
      router.refresh();
      setIsLoggingOut(false);
    }
  }

  const sessionIndicator = isBootstrapping ? (
    <span className="h-8 w-24 animate-pulse rounded-md border border-zinc-800 bg-zinc-900/80">
      <span className="sr-only">Loading session</span>
    </span>
  ) : null;

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4">
        <Link href="/" className="inline-flex items-center gap-3">
          <img
            src="/malachite-logo.png"
            alt="MalachiteX Logo"
            className="h-10 w-10 shrink-0 object-contain [image-rendering:auto] drop-shadow-[0_0_10px_rgba(34,197,94,0.35)]"
          />
          <span className="bg-gradient-to-r from-[#00FF88] via-emerald-400 to-[#00C853] bg-clip-text text-2xl font-bold tracking-wide text-transparent drop-shadow-[0_0_10px_rgba(0,255,120,0.6)] transition-all duration-300 hover:scale-105">
            MalachiteX
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              prefetch={false}
              className={cn(
                "rounded-md px-3 py-2 text-sm transition-colors",
                (link.href === "/" ? pathname === "/" : pathname.startsWith(link.href))
                  ? "bg-emerald-950/70 text-emerald-200"
                  : "text-slate-300 hover:bg-zinc-800 hover:text-white",
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {isBootstrapping ? (
            sessionIndicator
          ) : isAuthenticated && user ? (
            <>
              <div className="hidden items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900/70 px-3 py-1.5 md:flex">
                <UserCircle2 className="h-4 w-4 text-emerald-300" />
                <div className="text-xs">
                  <p className="font-medium text-slate-100">{user.username}</p>
                  <p className="text-slate-400">{user.email}</p>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={handleLogout} disabled={isLoggingOut}>
                <LogOut className="mr-2 h-4 w-4" />
                {isLoggingOut ? "Logging out..." : "Logout"}
              </Button>
            </>
          ) : (
            <>
              <Link className="hidden sm:inline-flex" href="/login?demo=1&next=/dashboard" prefetch={false}>
                <Button variant="outline" size="sm" className="gap-2">
                  <Sparkles className="h-4 w-4" />
                  Try Demo
                </Button>
              </Link>
              <Link href="/login" prefetch={false}>
                <Button variant="ghost" size="sm">
                  Login
                </Button>
              </Link>
              <Link href="/signup" prefetch={false}>
                <Button size="sm">Sign up</Button>
              </Link>
            </>
          )}
        </div>
      </div>
      <nav className="mx-auto flex w-full max-w-7xl gap-2 overflow-x-auto px-4 pb-3 md:hidden">
        {navLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            prefetch={false}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1.5 text-xs transition-colors",
              (link.href === "/" ? pathname === "/" : pathname.startsWith(link.href))
                ? "border-emerald-700/50 bg-emerald-950/70 text-emerald-200"
                : "border-zinc-800 bg-zinc-950/70 text-slate-300 hover:bg-zinc-900",
            )}
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
