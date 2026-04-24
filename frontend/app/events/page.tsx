"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Nav } from "@/components/Nav";
import { WalletConnect } from "@/components/WalletConnect";
import { useWallet } from "@/contexts/WalletContext";
import { api, type EventRecord } from "@/lib/api";

export default function EventsPage() {
  const router = useRouter();
  const { status } = useWallet();
  const connected = status === "connected";
  const [lookup, setLookup] = useState("");

  const { data: events = [], isLoading, isError } = useQuery({
    queryKey: ["events"],
    queryFn: () => api.events.list(),
  });

  function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    const addr = lookup.trim();
    if (addr) router.push(`/events/${encodeURIComponent(addr)}`);
  }

  return (
    <>
      <Nav />
      <main className="min-h-dvh bg-[#080808] pt-14">
        <div className="mx-auto max-w-2xl px-5 pt-12 pb-24">
          {/* Page header */}
          <div className="flex items-start justify-between mb-8 gap-4">
            <div>
              <p className="text-[11px] text-zinc-500 uppercase tracking-widest font-medium mb-1.5">Platform</p>
              <h1 className="text-2xl font-bold text-white tracking-tight">Events</h1>
              <p className="text-sm text-zinc-500 mt-1">Your deployed events and events you&apos;ve attended.</p>
            </div>
            {connected ? (
              <Link
                href="/events/new"
                className="shrink-0 text-xs font-semibold bg-white hover:bg-zinc-100 text-black px-3 py-2 transition-colors flex items-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                New Event
              </Link>
            ) : (
              <div className="shrink-0 text-xs text-zinc-600 border border-white/6 px-3 py-2 flex items-center gap-1.5 opacity-50 cursor-not-allowed select-none">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
                </svg>
                New Event
              </div>
            )}
          </div>

          {/* Wallet gate banner */}
          {!connected && (
            <div className="mb-6">
              <WalletConnect />
            </div>
          )}

          {/* Lookup by contract address */}
          <form onSubmit={handleLookup} className="flex gap-2 mb-8">
            <input
              type="text"
              placeholder="Look up event by contract address…"
              value={lookup}
              onChange={(e) => setLookup(e.target.value)}
              className="flex-1 bg-white/[0.03] border border-white/8 px-4 py-2.5 text-sm text-white font-mono placeholder-zinc-700 focus:outline-none focus:border-white/30 transition-colors"
            />
            <button
              type="submit"
              disabled={!lookup.trim()}
              className="text-sm font-medium bg-white text-black px-4 py-2.5 hover:bg-zinc-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              Go →
            </button>
          </form>

          {isLoading ? (
            <div className="text-center py-20 border border-white/6 bg-white/[0.02]">
              <p className="text-zinc-600 text-sm">Loading events…</p>
            </div>
          ) : isError ? (
            <div className="text-center py-20 border border-white/6 bg-white/[0.02]">
              <p className="text-red-400 text-sm">Failed to load events. Is the backend running?</p>
            </div>
          ) : events.length === 0 ? (
            <div className="text-center py-20 border border-white/6 bg-white/[0.02]">
              <p className="text-zinc-600 text-sm">No events yet.</p>
              {connected ? (
                <Link
                  href="/events/new"
                  className="inline-block mt-4 text-xs text-zinc-500 hover:text-zinc-400 transition-colors"
                >
                  Create your first event →
                </Link>
              ) : (
                <p className="mt-3 text-xs text-zinc-700">Connect a wallet to create events.</p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {events.map((event) => (
                <EventCard key={event.contractAddress} event={event} />
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  );
}

function EventCard({ event }: { event: EventRecord }) {
  return (
    <Link
      href={`/events/${encodeURIComponent(event.contractAddress)}`}
      className="flex items-center justify-between gap-4 border border-white/8 bg-white/[0.02] hover:bg-white/[0.04] px-5 py-4 transition-colors group"
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold text-white truncate">{event.name}</p>
        <p className="text-xs text-zinc-600 font-mono mt-1 truncate">
          {event.contractAddress}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-xs text-zinc-400 tabular-nums">{event.maxCapacity ?? "—"} cap</p>
        <p className="text-xs text-zinc-600 mt-0.5">
          {new Date(event.createdAt).toLocaleDateString()}
        </p>
      </div>
    </Link>
  );
}
