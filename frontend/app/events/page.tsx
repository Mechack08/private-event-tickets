"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Nav } from "@/components/Nav";
import { getMyEvents, type StoredEvent } from "@/lib/storage";

export default function EventsPage() {
  const router = useRouter();
  const [events, setEvents] = useState<StoredEvent[]>([]);
  const [lookup, setLookup] = useState("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setEvents(getMyEvents());
    setHydrated(true);
  }, []);

  function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    const addr = lookup.trim();
    if (addr) router.push(`/events/${encodeURIComponent(addr)}`);
  }

  return (
    <>
      <Nav />
      <main className="min-h-dvh bg-[#0a0a0a] pt-14">
        <div className="mx-auto max-w-2xl px-5 pt-12 pb-24">
          <div className="flex items-center justify-between mb-10">
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">
                Events
              </h1>
              <p className="text-sm text-zinc-500 mt-1">
                Your events and events you&apos;ve visited.
              </p>
            </div>
            <Link
              href="/events/new"
              className="text-xs font-medium bg-white text-black px-3 py-1.5 rounded-lg hover:bg-zinc-100 transition-colors"
            >
              + New Event
            </Link>
          </div>

          {/* Lookup by contract address */}
          <form onSubmit={handleLookup} className="flex gap-2 mb-8">
            <input
              type="text"
              placeholder="View event by contract address…"
              value={lookup}
              onChange={(e) => setLookup(e.target.value)}
              className="flex-1 bg-white/4 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white font-mono placeholder-zinc-600 focus:outline-none focus:border-white/30 transition-colors"
            />
            <button
              type="submit"
              disabled={!lookup.trim()}
              className="text-sm font-medium bg-white text-black px-4 py-2.5 rounded-xl hover:bg-zinc-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              Go
            </button>
          </form>

          {!hydrated ? null : events.length === 0 ? (
            <div className="text-center py-20 border border-white/6 rounded-2xl">
              <p className="text-zinc-600 text-sm">No events yet.</p>
              <Link
                href="/events/new"
                className="inline-block mt-4 text-xs text-zinc-400 hover:text-white underline underline-offset-4 transition-colors"
              >
                Create your first event →
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
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

function EventCard({ event }: { event: StoredEvent }) {
  return (
    <Link
      href={`/events/${encodeURIComponent(event.contractAddress)}`}
      className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/3 hover:bg-white/5 px-5 py-4 transition-colors group"
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-white truncate">{event.eventName}</p>
        <p className="text-xs text-zinc-600 font-mono mt-1 truncate">
          {event.contractAddress}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-xs text-zinc-400 tabular-nums">
          {event.totalTickets} tickets
        </p>
        <p className="text-xs text-zinc-600 mt-0.5">
          {new Date(event.createdAt).toLocaleDateString()}
        </p>
      </div>
    </Link>
  );
}
