"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Nav } from "@/components/Nav";
import { useAuth } from "@/contexts/AuthContext";
import { api, type EventRecord } from "@/lib/api";
import { getMyEvents, type StoredEvent } from "@/lib/storage";
import { cn } from "@/lib/utils";

/**
 * Build a safe CreateEventInput from a StoredEvent.
 * localStorage entries from older app versions may be missing fields that are
 * now required by the backend schema — add fallbacks so JSON.stringify never
 * drops a required key (it silently drops `undefined` values, producing a
 * Zod "Required" error on the server).
 */
function toCreateInput(event: StoredEvent) {
  const now = new Date().toISOString();
  return {
    contractAddress: event.contractAddress,
    name:            event.eventName || "Untitled Event",
    description:     event.description || "—",
    location:        event.location    || "TBD",
    country:         event.country,
    city:            event.city,
    latitude:        event.latitude,
    longitude:       event.longitude,
    startDate:       event.startDate   || now,
    endDate:         event.endDate     || now,
    maxCapacity:     event.totalTickets || 1,
    minAge:          event.minAge ?? 0,
  };
}

export default function EventsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const connected = !!user;
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
          await api.events.create(toCreateInput(event));
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

  const now = new Date();
  const happening = events.filter((e) => {
    const s = e.startDate ? new Date(e.startDate) : null;
    const en = e.endDate ? new Date(e.endDate) : null;
    return s && s <= now && (!en || en > now);
  });
  const upcoming = events.filter((e) => {
    const s = e.startDate ? new Date(e.startDate) : null;
    return !s || s > now;
  });
  const past = events.filter((e) => {
    const en = e.endDate ? new Date(e.endDate) : null;
    return en && en <= now;
  });

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
                <p className="mt-3 text-xs text-zinc-700">Sign in to create events.</p>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              {happening.length > 0 && (
                <section>
                  <p className="text-[11px] font-mono text-emerald-600 uppercase tracking-widest mb-2 px-1">Happening now</p>
                  <div className="space-y-2">
                    {happening.map((e) => <EventCard key={e.contractAddress} event={e} />)}
                  </div>
                </section>
              )}
              {upcoming.length > 0 && (
                <section>
                  <p className="text-[11px] font-mono text-sky-700 uppercase tracking-widest mb-2 px-1">Upcoming</p>
                  <div className="space-y-2">
                    {upcoming.map((e) => <EventCard key={e.contractAddress} event={e} />)}
                  </div>
                </section>
              )}
              {past.length > 0 && (
                <section>
                  <p className="text-[11px] font-mono text-zinc-700 uppercase tracking-widest mb-2 px-1">Past</p>
                  <div className="space-y-2">
                    {past.map((e) => <EventCard key={e.contractAddress} event={e} />)}
                  </div>
                </section>
              )}
              {localOnly.length > 0 && (
                <section>
                  <p className="text-[11px] font-mono text-yellow-800 uppercase tracking-widest mb-2 px-1">
                    Your events (not yet in public list)
                  </p>
                  <div className="space-y-2">
                    {localOnly.map((e) => <LocalEventCard key={e.contractAddress} event={e} connected={connected} />)}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      </main>
    </>
  );
}

// Deterministic accent colour — uses the same djb2 seed as EventPlaceholder so
// the 2px top line on every card matches that event's generative poster palette.
function nameToAccent(name: string): string {
  let h = 5381;
  for (let i = 0; i < name.length; i++) h = (((h << 5) + h) ^ name.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360},${62 + (h % 22)}%,62%)`;
}

function fmtShort(d: Date) {
  const date = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return `${date}, ${time}`;
}

type TimeStatus = "upcoming" | "now" | "past";

function getTimeStatus(start: Date | null, end: Date | null): TimeStatus {
  const now = new Date();
  if (end && end < now) return "past";
  if (start && start > now) return "upcoming";
  return "now";
}

const STATUS_STYLE: Record<TimeStatus, { label: string; cls: string }> = {
  now:      { label: "Happening now", cls: "text-emerald-400 border-emerald-500/25 bg-emerald-500/[0.06]" },
  upcoming: { label: "Upcoming",      cls: "text-sky-400    border-sky-500/25    bg-sky-500/[0.06]" },
  past:     { label: "Past",          cls: "text-zinc-600   border-zinc-700/40   bg-white/[0.02]" },
};

function EventCard({ event }: { event: EventRecord }) {
  const accent = nameToAccent(event.name);
  const start  = event.startDate ? new Date(event.startDate) : null;
  const end    = event.endDate   ? new Date(event.endDate)   : null;
  const location = [event.city, event.country].filter(Boolean).join(", ") || event.location;
  const status = getTimeStatus(start, end);
  const claimed   = event.claimedCount ?? 0;
  const capacity  = event.maxCapacity;
  const remaining = capacity != null ? Math.max(0, capacity - claimed) : null;

  return (
    <Link
      href={`/events/${encodeURIComponent(event.contractAddress)}`}
      className={cn(
        "group block border bg-white/[0.02] hover:bg-white/[0.04] transition-colors overflow-hidden",
        status === "past" ? "border-white/5 opacity-60 hover:opacity-80" : "border-white/8",
      )}
    >
      {/* Accent line */}
      <div className="h-[2px]" style={{ background: status === "past" ? accent + "50" : accent }} />
      <div className="px-5 py-4">
        <div className="flex items-start justify-between gap-3 mb-2.5">
          <p className="text-sm font-semibold text-white leading-snug group-hover:text-zinc-100 transition-colors">
            {event.name}
          </p>
          <svg className="w-3.5 h-3.5 text-zinc-700 group-hover:text-zinc-400 shrink-0 mt-0.5 transition-colors" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
          </svg>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-2.5">
          {location && (
            <span className="flex items-center gap-1 text-xs text-zinc-500">
              <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
              </svg>
              {location}
            </span>
          )}
          {start && (
            <span className="flex items-center gap-1 text-xs text-zinc-500">
              <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
              </svg>
              {fmtShort(start)}{end && end.toDateString() !== start.toDateString() ? ` – ${fmtShort(end)}` : ""}
            </span>
          )}
        </div>
        {/* Badges row: status + FREE + age + capacity */}
        <div className="flex flex-wrap items-center gap-1.5 mb-2.5">
          <span className={`text-[10px] font-mono font-semibold border px-2 py-0.5 leading-none ${STATUS_STYLE[status].cls}`}>
            {STATUS_STYLE[status].label}
          </span>
          <span className="text-[10px] font-mono font-semibold text-emerald-400 border border-emerald-500/25 bg-emerald-500/[0.06] px-2 py-0.5 leading-none">
            FREE
          </span>
          {(event.minAge ?? 0) > 0 && (
            <span className="text-[10px] font-mono font-semibold text-amber-400 border border-amber-500/25 bg-amber-500/[0.06] px-2 py-0.5 leading-none">
              {event.minAge}+
            </span>
          )}
          {capacity != null && (
            <span className="text-[10px] font-mono text-zinc-600 border border-white/6 px-2 py-0.5 leading-none tabular-nums">
              {remaining === 0 ? "Sold out" : remaining !== null ? `${remaining} left` : `${capacity} seats`}
            </span>
          )}
        </div>
        {capacity != null && claimed > 0 && (
          <div className="mb-2">
            <div className="h-px bg-white/[0.04] overflow-hidden">
              <div
                className="h-full bg-white/20 transition-all"
                style={{ width: `${Math.min(100, (claimed / capacity) * 100)}%` }}
              />
            </div>
            <p className="text-[10px] font-mono text-zinc-700 mt-1 tabular-nums">
              {claimed} / {capacity} claimed
            </p>
          </div>
        )}
        <p className="text-[10px] font-mono text-zinc-700 truncate">{event.contractAddress}</p>
      </div>
    </Link>
  );
}

function LocalEventCard({ event, connected }: { event: StoredEvent; connected: boolean }) {
  const queryClient = useQueryClient();
  const [syncState, setSyncState] = useState<"idle" | "syncing" | "done" | "error">("idle");
  const [syncError, setSyncError] = useState<string | null>(null);
  const accent = nameToAccent(event.eventName);
  const start = event.startDate ? new Date(event.startDate) : null;
  const end   = event.endDate   ? new Date(event.endDate)   : null;
  const location = [event.city, event.country].filter(Boolean).join(", ") || event.location;
  const status = getTimeStatus(start, end);

  async function handleSync(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setSyncState("syncing");
    setSyncError(null);
    try {
      await api.events.create(toCreateInput(event));
      setSyncState("done");
      await queryClient.invalidateQueries({ queryKey: ["events"] });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setSyncError(msg);
      setSyncState("error");
    }
  }

  return (
    <div className="border border-white/8 border-dashed bg-white/[0.015] overflow-hidden">
      <div className="h-[2px]" style={{ background: accent + "80" }} />
      <div className="flex items-start gap-3 px-5 py-4">
        <Link
          href={`/events/${encodeURIComponent(event.contractAddress)}`}
          className="flex-1 min-w-0 group"
        >
          <div className="flex items-center gap-2 mb-2">
            <p className="text-sm font-semibold text-white truncate group-hover:text-zinc-100 transition-colors">
              {event.eventName}
            </p>
            <span className="shrink-0 text-[9px] font-mono font-bold text-yellow-600 border border-yellow-600/30 px-1.5 py-0.5 leading-none">
              LOCAL
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-2">
            {location && (
              <span className="flex items-center gap-1 text-xs text-zinc-500">
                <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
                </svg>
                {location}
              </span>
            )}
            {start && (
              <span className="flex items-center gap-1 text-xs text-zinc-500">
                <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
                </svg>
                {fmtShort(start)}{end && end.toDateString() !== start.toDateString() ? ` – ${fmtShort(end)}` : ""}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 mb-2">
            <span className={`text-[10px] font-mono font-semibold border px-2 py-0.5 leading-none ${STATUS_STYLE[status].cls}`}>
              {STATUS_STYLE[status].label}
            </span>
            <span className="text-[10px] font-mono font-semibold text-emerald-400 border border-emerald-500/25 bg-emerald-500/[0.06] px-2 py-0.5 leading-none">
              FREE
            </span>
            {(event.minAge ?? 0) > 0 && (
              <span className="text-[10px] font-mono font-semibold text-amber-400 border border-amber-500/25 bg-amber-500/[0.06] px-2 py-0.5 leading-none">
                {event.minAge}+
              </span>
            )}
          </div>
          <p className="text-[10px] font-mono text-zinc-700 truncate">{event.contractAddress}</p>
        </Link>
        {connected && (
          <button
            onClick={handleSync}
            disabled={syncState === "syncing" || syncState === "done"}
            title={
              syncState === "error"
                ? `Sync failed: ${syncError ?? "unknown error"} — click to retry`
                : "Publish to the public event list"
            }
            className={cn(
              "shrink-0 text-[11px] font-medium border px-3 py-1.5 transition-colors",
              syncState === "done"
                ? "border-emerald-500/30 text-emerald-400 cursor-default"
                : syncState === "error"
                ? "border-red-500/30 text-red-400 hover:border-red-400/50 hover:text-red-300"
                : syncState === "syncing"
                ? "border-white/10 text-zinc-600 cursor-not-allowed"
                : "border-white/12 text-zinc-400 hover:border-white/25 hover:text-white",
            )}
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
      {syncState === "error" && syncError && (
        <p className="px-5 pb-3 text-[11px] text-red-400/70 font-mono truncate">{syncError}</p>
      )}
    </div>
  );
}
