"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { WalletConnect } from "@/components/WalletConnect";
import { AuthButton } from "@/components/AuthButton";

const links = [
  { href: "/events",        label: "Events" },
  { href: "/my-tickets",    label: "My Tickets" },
  { href: "/verify",        label: "Verify" },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <header className="fixed top-0 inset-x-0 z-50 border-b border-white/8 bg-[#080808]/90 backdrop-blur-md">
      <div className="mx-auto max-w-5xl px-5 h-14 flex items-center gap-6">
        <Link
          href="/"
          className="text-sm font-semibold tracking-tight text-white hover:text-zinc-300 transition-colors shrink-0"
        >
          Midnight<span className="text-zinc-500">Tickets</span>
        </Link>

        <nav className="flex items-center gap-1 flex-1">
          {links.map(({ href, label }) => {
            const active = pathname === href || pathname.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                className={`px-3 py-1.5 text-sm transition-colors ${
                  active
                    ? "bg-white text-black font-medium"
                    : "text-zinc-400 hover:text-white hover:bg-white/8"
                }`}
              >
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Auth (Google) — identity for backend */}
        <AuthButton />

        {/* Wallet — transaction signing only */}
        <WalletConnect compact />
      </div>
    </header>
  );
}
