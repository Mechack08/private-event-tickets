"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Nav } from "@/components/Nav";
import { WalletConnect } from "@/components/WalletConnect";
import { useWallet } from "@/contexts/WalletContext";
import { saveEvent } from "@/lib/storage";

export default function NewEventPage() {
  const router = useRouter();
  const { status, wallet } = useWallet();

  const [eventName, setEventName] = useState("");
  const [totalTickets, setTotalTickets] = useState("100");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isWalletReady = status === "connected" && wallet !== null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isWalletReady) return;
    setLoading(true);
    setError(null);

    try {
      const [{ createEventTicketProviders }, { EventTicketAPI }, { PREPROD_CONFIG }] =
        await Promise.all([
          import("@sdk/providers"),
          import("@sdk/contract-api"),
          import("@sdk/types"),
        ]);

      const providers = await createEventTicketProviders(wallet, PREPROD_CONFIG);
      const api = await EventTicketAPI.deploy(providers);
      const { txId } = await api.createEvent(eventName.trim(), BigInt(totalTickets));

      // Persist to localStorage so the event appears in the listing.
      saveEvent({
        contractAddress: api.contractAddress,
        eventName: eventName.trim(),
        totalTickets: parseInt(totalTickets, 10),
        txId,
        createdAt: new Date().toISOString(),
      });

      router.push(`/events/${encodeURIComponent(api.contractAddress)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setLoading(false);
    }
  }

  return (
    <>
      <Nav />
      <main className="min-h-dvh bg-[#0a0a0a] pt-14">
        <div className="mx-auto max-w-lg px-5 pt-12 pb-24">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-xs text-zinc-600 mb-8">
            <Link href="/events" className="hover:text-white transition-colors">
              Events
            </Link>
            <span>/</span>
            <span className="text-zinc-400">New</span>
          </div>

          <div className="mb-8">
            <h1 className="text-2xl font-bold text-white tracking-tight mb-2">
              Create Event
            </h1>
            <p className="text-sm text-zinc-500">
              Deploy a new ZK ticketing contract on Midnight. Your shielded
              wallet key becomes the on-chain organizer — only you can issue
              tickets.
            </p>
          </div>

          <WalletConnect />

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label
                htmlFor="eventName"
                className="block text-xs font-medium text-zinc-400 mb-2"
              >
                Event name
              </label>
              <input
                id="eventName"
                type="text"
                placeholder="e.g. DevCon 2026"
                value={eventName}
                onChange={(e) => setEventName(e.target.value)}
                maxLength={64}
                required
                disabled={loading}
                className="w-full bg-white/4 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-white/30 disabled:opacity-40 transition-colors"
              />
            </div>

            <div>
              <label
                htmlFor="totalTickets"
                className="block text-xs font-medium text-zinc-400 mb-2"
              >
                Maximum tickets
              </label>
              <input
                id="totalTickets"
                type="number"
                min={1}
                max={4294967295}
                value={totalTickets}
                onChange={(e) => setTotalTickets(e.target.value)}
                required
                disabled={loading}
                className="w-full bg-white/4 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-white/30 disabled:opacity-40 transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !isWalletReady}
              className="w-full bg-white text-black text-sm font-medium py-3 rounded-xl hover:bg-zinc-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? "Deploying contract…" : "Create Event"}
            </button>

            {!isWalletReady && (
              <p className="text-xs text-zinc-600 text-center">
                Connect your Lace wallet above to continue
              </p>
            )}
          </form>

          {loading && (
            <div className="mt-6 rounded-xl border border-white/8 bg-white/3 px-4 py-4 space-y-1">
              <p className="text-sm text-zinc-300">
                Deploying and initialising on-chain state…
              </p>
              <p className="text-xs text-zinc-600">
                This takes 30–90 s on preprod. Do not close the tab.
              </p>
            </div>
          )}

          {error && (
            <div className="mt-6 rounded-xl border border-red-500/20 bg-red-500/6 px-4 py-4">
              <p className="text-sm font-medium text-red-400 mb-1">Error</p>
              <p className="text-xs text-red-300/70 break-all">{error}</p>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
