"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Nav } from "@/components/Nav";
import { WalletConnect } from "@/components/WalletConnect";
import { useWallet } from "@/contexts/WalletContext";
import { api, type EventRecord } from "@/lib/api";
import { getMyEvents, type StoredEvent } from "@/lib/storage";

export default function EventsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { status } = useWallet();
  const connected = status === "connected";
  const [lookup, setLookup] = useState("");
  const [localEvents, setLocalEvents] = useState<StoredEvent[]>([]);
  const autoSyncAttempted = useRef(false);

  // Load localStorage events on mount (client-only).
  useEffect(() => {
    setLocalEvents(getMyEvents());
  }, []);

  const { data: backendEvents = [], isLoading, isError } = useQuery({
    queryKey: ["events"],
    queryFn: () => api.events.list(),
  });

  // Merge: backend events take precedence; surface local-only events so the
  // user can see their deployed events even when the backend sync failed.
  const backendAddresses = new Set(backendEvents.map((e) => e.contractAddress));
  const localOnly = localEvents.filter((e) => !backendAddresses.has(e.contractAddress));

  const events = backendEvents;

  // Auto-sync: when the user is authenticated and has local-only events,
  // silently attempt to push each one to the backend once per page load.
  // On success the query is invalidated and they appear in the public list.
  // On failure they stay in localOnly with the manual sync button visible.
  useEffect(() => {
    if (!connected || localOnly.length === 0 || autoSyncAttempted.current) return;
    autoSyncAttempted.current = true;

    const syncAll = async () => {
      let anySuccess = false;
      for (const event of localOnly) {
        try {
          await api.events.create({
            contractAddress: event.contractAddress,
            name:            event.eventName,
            description:     event.description || "—",
            location:        event.location,
            country:         event.country,
            city:            event.city,
            latitude:        event.latitude,
            longitude:       event.longitude,
            startDate:       event.startDate,
            endDate:         event.endDate,
            maxCapacity:     event.totalTickets,
          });
          anySuccess = true;
        } catch {
          // Stays visible as a local card with the manual sync button.
        }
      }
      if (anySuccess) {
        await queryClient.invalidateQueries({ queryKey: ["events"] });
      }
    };

    syncAll();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);

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
          ) : events.length === 0 && localOnly.length === 0 ? (
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
              {localOnly.length > 0 && (
                <>
                  {events.length > 0 && (
                    <p className="text-[11px] text-zinc-700 uppercase tracking-widest pt-4 pb-1 px-1">
                      Your events (not yet in public list)
                    </p>
                  )}
                  {localOnly.map((event) => (
                    <LocalEventCard key={event.contractAddress} event={event} connected={connected} />
                  ))}
                </>
              )}
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

function LocalEventCard({ event, connected }: { event: StoredEvent; connected: boolean }) {
  const queryClient = useQueryClient();
  const [syncState, setSyncState] = useState<"idle" | "syncing" | "done" | "error">("idle");
  const [syncError, setSyncError] = useState<string | null>(null);

  async function handleSync(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setSyncState("syncing");
    setSyncError(null);
    try {
      await api.events.create({
        contractAddress: event.contractAddress,
        name:            event.eventName,
        description:     event.description || "—",
        location:        event.location,
        country:         event.country,
        city:            event.city,
        latitude:        event.latitude,
        longitude:       event.longitude,
        startDate:       event.startDate,
        endDate:         event.endDate,
        maxCapacity:     event.totalTickets,
      });
      setSyncState("done");
      await queryClient.invalidateQueries({ queryKey: ["events"] });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setSyncError(msg);
      setSyncState("error");
    }
  }

  return (
    <div className="border border-white/8 border-dashed bg-white/[0.015]">
      <div className="flex items-center gap-3 px-5 py-4">
        {/* Clickable event info area */}
        <Link
          href={`/events/${encodeURIComponent(event.contractAddress)}`}
          className="flex-1 min-w-0 flex items-center justify-between gap-4 group"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-white truncate group-hover:text-zinc-200 transition-colors">
                {event.eventName}
              </p>
              <span className="text-[10px] font-mono text-yellow-600 border border-yellow-600/30 px-1.5 py-0.5 shrink-0">
                local
              </span>
            </div>
            <p className="text-xs text-zinc-600 font-mono mt-1 truncate">
              {event.contractAddress}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-xs text-zinc-400 tabular-nums">{event.totalTickets} cap</p>
            <p className="text-xs text-zinc-600 mt-0.5">
              {new Date(event.createdAt).toLocaleDateString()}
            </p>
          </div>
        </Link>

        {/* Sync action — only visible when wallet is connected */}
        {connected && (
          <button
            onClick={handleSync}
            disabled={syncState === "syncing" || syncState === "done"}
            title={
              syncState === "error"
                ? `Sync failed: ${syncError ?? "unknown error"} — click to retry`
                : "Publish to the public event list"
            }
            className={[
              "shrink-0 text-[11px] font-medium border px-3 py-1.5 transition-colors",
              syncState === "done"
                ? "border-emerald-500/30 text-emerald-400 cursor-default"
                : syncState === "error"
                ? "border-red-500/30 text-red-400 hover:border-red-400/50 hover:text-red-300"
                : syncState === "syncing"
                ? "border-white/10 text-zinc-600 cursor-not-allowed"
                : "border-white/12 text-zinc-400 hover:border-white/25 hover:text-white",
            ].join(" ")}
          >
            {syncState === "syncing" ? (
              <span className="flex items-center gap-1.5">
                <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                  <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Syncing
              </span>
            ) : syncState === "done" ? (
              "✓ Public"
            ) : syncState === "error" ? (
              "Retry sync"
            ) : (
              "Make public"
            )}
          </button>
        )}
      </div>

      {/* Inline error detail */}
      {syncState === "error" && syncError && (
        <p className="px-5 pb-3 text-[11px] text-red-400/70 font-mono truncate">
          {syncError}
        </p>
      )}
    </div>
  );
}
