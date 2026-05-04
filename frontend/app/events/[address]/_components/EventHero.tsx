"use client";

import { useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { EventPlaceholder } from "@/components/EventPlaceholder";
import { formatEventDate, formatDateBig } from "@/lib/utils/dates";
import type { StoredEvent } from "@/lib/storage";

const EventLocationMap = dynamic(
  () => import("@/components/EventLocationMap"),
  { ssr: false, loading: () => <div className="w-full h-full bg-white/[0.02] animate-pulse" /> },
);

interface EventHeroProps {
  address: string;
  event: StoredEvent | null;
  isOrganizer: boolean;
}

export function EventHero({ address, event, isOrganizer }: EventHeroProps) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const start = event?.startDate ? new Date(event.startDate) : null;
  const end   = event?.endDate   ? new Date(event.endDate)   : null;
  const sameDay = start && end && start.toDateString() === end.toDateString();
  const location = [event?.city, event?.country].filter(Boolean).join(", ") || event?.location;
  const desc = event?.description?.trim() ?? "";
  const longDesc = desc.length > 260;

  function copyAddress() {
    navigator.clipboard.writeText(address).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const statRows: { label: string; date: Date | null }[] = [
    { label: "STARTS", date: start },
    { label: "ENDS",   date: end   },
  ];

  return (
    <div>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-zinc-600 mb-5">
        <Link href="/events" className="hover:text-white transition-colors">Events</Link>
        <span>/</span>
        <span className="font-mono text-zinc-500 truncate max-w-[200px]">
          {address.length > 24 ? address.slice(0, 24) + "…" : address}
        </span>
      </div>

      {/* Generative poster banner */}
      <div className="relative overflow-hidden mb-6 border border-white/6" style={{ height: "200px" }}>
        <EventPlaceholder name={event?.eventName ?? address} />
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#0a0a0a] to-transparent pointer-events-none" />
        <div className="absolute top-3 right-3">
          <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-white/45 border border-white/10 bg-black/50 px-2 py-1">
            ZK·MIDNIGHT
          </span>
        </div>
        {isOrganizer && (
          <div className="absolute top-3 left-3">
            <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-emerald-400/80 border border-emerald-500/25 bg-black/50 px-2 py-1">
              ✦ Organizer
            </span>
          </div>
        )}
      </div>

      {/* Name */}
      <h1 className="text-[28px] font-black text-white tracking-tight leading-tight mb-3">
        {event?.eventName
          ? event.eventName
          : <span className="text-zinc-600 text-xl font-mono">{address.slice(0, 20)}…</span>}
      </h1>

      {/* Location + date inline */}
      {(location || start) && (
        <div className="flex flex-wrap gap-x-5 gap-y-1.5 mb-5">
          {location && (
            <span className="flex items-center gap-1.5 text-sm text-zinc-400">
              <svg className="w-3.5 h-3.5 text-zinc-600 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
              </svg>
              {location}
            </span>
          )}
          {start && (
            <span className="flex items-center gap-1.5 text-sm text-zinc-400">
              <svg className="w-3.5 h-3.5 text-zinc-600 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
              </svg>
              {formatEventDate(start)}
              {end && end.toDateString() !== start.toDateString()
                ? ` → ${formatEventDate(end)}`
                : ""}
            </span>
          )}
        </div>
      )}

      {/* Description */}
      {desc && (
        <div className="mb-6">
          <p className={`text-sm text-zinc-400 leading-relaxed ${!expanded && longDesc ? "line-clamp-3" : ""}`}>
            {desc}
          </p>
          {longDesc && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-[11px] text-zinc-600 hover:text-zinc-300 mt-1.5 transition-colors"
            >
              {expanded ? "Show less ↑" : "Show more ↓"}
            </button>
          )}
        </div>
      )}

      {/* Location map */}
      {event?.latitude != null && event?.longitude != null && (
        <div className="mb-6 border border-white/8 overflow-hidden">
          <div style={{ height: 240 }} className="isolate">
            <EventLocationMap
              lat={event.latitude}
              lng={event.longitude}
              label={location ?? event.eventName}
            />
          </div>
          <div className="flex items-center justify-between gap-4 bg-white/[0.025] border-t border-white/6 px-4 py-2.5">
            <p className="text-[11px] font-mono text-zinc-500 truncate flex-1">
              {location || `${event.latitude.toFixed(5)}, ${event.longitude.toFixed(5)}`}
            </p>
            <div className="flex items-center gap-2 shrink-0">
              <a
                href={`https://www.openstreetmap.org/?mlat=${event.latitude}&mlon=${event.longitude}&zoom=15`}
                target="_blank" rel="noopener noreferrer"
                className="text-[10px] font-mono text-zinc-600 hover:text-white border border-white/8 hover:border-white/20 px-2.5 py-1 transition-colors"
              >
                OSM ↗
              </a>
              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${event.latitude},${event.longitude}`}
                target="_blank" rel="noopener noreferrer"
                className="text-[10px] font-mono text-zinc-600 hover:text-white border border-white/8 hover:border-white/20 px-2.5 py-1 transition-colors"
              >
                Directions ↗
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Ticket-stub stats grid */}
      {event && (
        <div className="grid grid-cols-3 border border-white/8 divide-x divide-white/8 mb-5">
          {sameDay && start && end ? (
            <>
              <div className="px-4 py-4">
                <p className="text-[9px] font-mono font-semibold text-zinc-700 tracking-widest mb-2">DATE</p>
                {(() => {
                  const d = formatDateBig(start);
                  return (
                    <>
                      <p className="text-2xl font-black text-white tabular-nums leading-none">{d.day}</p>
                      <p className="text-xs font-mono text-zinc-400 mt-1">{d.month} {d.year}</p>
                      <p className="text-[10px] font-mono text-zinc-700 mt-0.5">{d.dow}</p>
                    </>
                  );
                })()}
              </div>
              <div className="px-4 py-4">
                <p className="text-[9px] font-mono font-semibold text-zinc-700 tracking-widest mb-2">TIME</p>
                <p className="text-lg font-black text-white tabular-nums leading-none">{formatDateBig(start).time}</p>
                <p className="text-[10px] font-mono text-zinc-600 mt-1">START</p>
                <p className="text-lg font-black text-white tabular-nums leading-none mt-2">{formatDateBig(end).time}</p>
                <p className="text-[10px] font-mono text-zinc-600 mt-1">END</p>
              </div>
            </>
          ) : (
            statRows.map(({ label, date }) => {
              const d = date ? formatDateBig(date) : null;
              return (
                <div key={label} className="px-4 py-4">
                  <p className="text-[9px] font-mono font-semibold text-zinc-700 tracking-widest mb-2">{label}</p>
                  {d ? (
                    <>
                      <p className="text-2xl font-black text-white tabular-nums leading-none">{d.day}</p>
                      <p className="text-xs font-mono text-zinc-400 mt-1">{d.month} {d.year}</p>
                      <p className="text-[10px] font-mono text-zinc-700 mt-0.5">{d.dow}</p>
                      <p className="text-[11px] font-mono text-zinc-400 mt-1.5 tabular-nums">{d.time}</p>
                    </>
                  ) : (
                    <p className="text-zinc-700 text-sm">—</p>
                  )}
                </div>
              );
            })
          )}

          {/* Capacity cell */}
          <div className="px-4 py-4">
            <p className="text-[9px] font-mono font-semibold text-zinc-700 tracking-widest mb-2">CAPACITY</p>
            <p className="text-2xl font-black text-white tabular-nums leading-none">{event.totalTickets}</p>
            <p className="text-xs font-mono text-zinc-400 mt-1">SEATS</p>
            {event.claimedCount !== undefined && event.totalTickets > 0 && (
              <>
                <p className="text-[10px] font-mono text-zinc-600 mt-1.5 tabular-nums">
                  {event.claimedCount} claimed
                </p>
                <div className="mt-1.5 h-px bg-white/[0.04] overflow-hidden">
                  <div
                    className="h-full bg-white/20"
                    style={{ width: `${Math.min(100, (event.claimedCount / event.totalTickets) * 100)}%` }}
                  />
                </div>
              </>
            )}
            {/* Time-status badge */}
            {(() => {
              const now = new Date();
              const ts =
                end && end < now ? "past" :
                start && start > now ? "upcoming" :
                "now";
              const badgeCls =
                ts === "now"      ? "text-emerald-400 border-emerald-500/25 bg-emerald-500/[0.06]" :
                ts === "upcoming" ? "text-sky-400    border-sky-500/25    bg-sky-500/[0.06]" :
                                    "text-zinc-600   border-zinc-700/40   bg-white/[0.02]";
              const label =
                ts === "now" ? "Happening now" : ts === "upcoming" ? "Upcoming" : "Past";
              return (
                <span className={`inline-block mt-2 text-[9px] font-mono font-semibold border px-1.5 py-0.5 leading-none ${badgeCls}`}>
                  {label}
                </span>
              );
            })()}
          </div>
        </div>
      )}

      {/* Contract address */}
      <div className="flex items-center gap-3 border border-white/6 bg-white/[0.02] px-4 py-3 mb-8">
        <p className="text-[9px] font-mono font-semibold text-zinc-700 tracking-widest shrink-0 uppercase">Contract</p>
        <p className="text-[11px] font-mono text-zinc-600 flex-1 truncate">{address}</p>
        <button
          onClick={copyAddress}
          className="shrink-0 text-[11px] text-zinc-600 hover:text-white border border-white/8 hover:border-white/20 px-2.5 py-1 transition-colors"
        >
          {copied ? "✓ Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}
