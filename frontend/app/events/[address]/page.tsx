"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import QRCode from "react-qr-code";
import { motion, AnimatePresence } from "framer-motion";
import { Nav } from "@/components/Nav";
import { EventPlaceholder } from "@/components/EventPlaceholder";
import { useWallet } from "@/contexts/WalletContext";
import { useAuth } from "@/contexts/AuthContext";
import {
  getEvent,
  getCallerSecret,
  saveCallerSecret,
  saveTicket,
  getMyTickets,
  markTicketUsed,
  type StoredEvent,
} from "@/lib/storage";
import { api as backendApi, type TicketRecord } from "@/lib/api";

// EventLocationMap loaded client-side only (Leaflet requires the DOM).
const EventLocationMap = dynamic(
  () => import("@/components/EventLocationMap"),
  { ssr: false, loading: () => <div className="w-full h-full bg-white/[0.02] animate-pulse" /> }
);

type EventStatus = "active" | "paused" | "cancelled";

// ─── Main page ────────────────────────────────────────────────────────────────

export default function EventDetailPage() {
  const params = useParams();
  const address = decodeURIComponent(params.address as string);
  const { user, loading: authLoading } = useAuth();

  const [event, setEvent] = useState<StoredEvent | null>(null);
  const [isOrganizer, setIsOrganizer] = useState(false);
  const [hasLocalKey, setHasLocalKey] = useState(false);
  const [organizerChecked, setOrganizerChecked] = useState(false);
  const [orgCheckError, setOrgCheckError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  // Called by OrganizerKeyImport after a key is successfully saved.
  function onKeyImported() {
    setHasLocalKey(true);
  }

  useEffect(() => {
    // Wait for auth to resolve before doing any check.
    if (authLoading) return;

    // Reset from any previous run (e.g. after retry).
    setIsOrganizer(false);
    setOrgCheckError(null);

    // ── Identity: always determined by the backend (cookie auth) ─────────────
    // If this browser also deployed the event, we can skip the network call
    // and read the event data from localStorage (faster path).
    const stored = getEvent(address);
    if (stored) {
      setEvent(stored);
      setIsOrganizer(true);
      // ZK key presence is independent of identity.
      setHasLocalKey(!!getCallerSecret(address));
      setOrganizerChecked(true);
      return;
    }

    // No local data — check the backend.
    // The session cookie (httpOnly) is sent automatically; no localStorage involved.
    backendApi.events.byAddress(address)
      .then((backendEvent) => {
        setOrgCheckError(null);
        // Always populate event data so every visitor (guest or organizer) sees
        // the full EventHero with name, dates, location, description, etc.
        setEvent({
          contractAddress: backendEvent.contractAddress,
          eventName:       backendEvent.name,
          totalTickets:    backendEvent.maxCapacity ?? 0,
          txId:            "",
          createdAt:       backendEvent.createdAt,
          callerSecretHex: "",
          description:     backendEvent.description ?? "",
          location:        backendEvent.location ?? "",
          country:         backendEvent.country ?? undefined,
          city:            backendEvent.city ?? undefined,
          latitude:        backendEvent.latitude ?? undefined,
          longitude:       backendEvent.longitude ?? undefined,
          startDate:       backendEvent.startDate ?? new Date().toISOString(),
          endDate:         backendEvent.endDate ?? new Date().toISOString(),
          minAge:          backendEvent.minAge ?? 0,
          claimedCount:    backendEvent.claimedCount ?? 0,
        });
        if (user && backendEvent.hostId === user.userId) {
          // Authenticated user is the host — check if their ZK key is already here.
          setIsOrganizer(true);
          setHasLocalKey(!!getCallerSecret(address));
        }
        // else: guest view — event data is set above, no organizer flags
      })
      .catch((err: unknown) => {
        const status = (err as { status?: number }).status;
        if (status === 404) {
          // Event exists on-chain but was never synced to the backend.
          // This happens if backend sync failed during event creation.
          setOrgCheckError(
            "This event has not been synced to the backend yet. " +
            "Open the original browser where you created it, go to the event page, " +
            "and use the Sync button on the Events list to register it."
          );
        } else {
          setOrgCheckError(
            "Could not reach the backend to verify organizer status. " +
            "Check that the server is running, then refresh."
          );
        }
      })
      .finally(() => setOrganizerChecked(true));
  }, [address, user, authLoading, retryKey]);

  if (authLoading || !organizerChecked) {
    return (
      <>
        <Nav />
        <main className="min-h-dvh bg-[#0a0a0a] pt-14">
          <div className="mx-auto max-w-2xl px-5 pt-12">
            <div className="h-8 w-48 bg-white/5 rounded animate-pulse mb-4" />
            <div className="h-4 w-72 bg-white/5 rounded animate-pulse" />
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <Nav />
      <main className="min-h-dvh bg-[#0a0a0a] pt-14">
        <div className="mx-auto max-w-2xl px-5 pt-6 pb-24">
          <EventHero address={address} event={event} isOrganizer={isOrganizer} />

          {isOrganizer && !hasLocalKey ? (
            <OrganizerKeyImport
              contractAddress={address}
              eventName={event?.eventName ?? ""}
              onImported={onKeyImported}
            />
          ) : isOrganizer ? (
            <OrganizerView address={address} event={event!} />
          ) : orgCheckError ? (
            <div className="border border-amber-500/25 bg-amber-500/[0.04] px-5 py-5 space-y-3">
              <p className="text-sm font-semibold text-amber-400">Could not verify organizer status</p>
              <p className="text-xs text-zinc-400 leading-relaxed">{orgCheckError}</p>
              <button
                className="text-xs text-zinc-500 hover:text-white underline underline-offset-2 transition-colors"
                onClick={() => {
                  setOrganizerChecked(false);
                  setOrgCheckError(null);
                  setRetryKey((k) => k + 1);
                }}
              >
                Retry
              </button>
            </div>
          ) : (
            <AttendeeView address={address} event={event} />
          )}
        </div>
      </main>
    </>
  );
}

// ─── Event hero ──────────────────────────────────────────────────────────────

function EventHero({
  address,
  event,
  isOrganizer,
}: {
  address: string;
  event: StoredEvent | null;
  isOrganizer: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const start = event?.startDate ? new Date(event.startDate) : null;
  const end   = event?.endDate   ? new Date(event.endDate)   : null;

  function fmtDate(d: Date) {
    const date = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    return `${date}, ${time}`;
  }

  function fmtBig(d: Date) {
    return {
      day:   d.toLocaleDateString("en-GB", { day: "2-digit" }),
      month: d.toLocaleDateString("en-GB", { month: "short" }).toUpperCase(),
      year:  d.getFullYear(),
      dow:   d.toLocaleDateString("en-GB", { weekday: "short" }).toUpperCase(),
      time:  d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
    };
  }

  function copyAddress() {
    navigator.clipboard.writeText(address).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const desc = event?.description?.trim() ?? "";
  const longDesc = desc.length > 260;
  const location = [event?.city, event?.country].filter(Boolean).join(", ") || event?.location;
  const statRows: { label: string; date: Date | null }[] = [
    { label: "STARTS", date: start },
    { label: "ENDS",   date: end   },
  ];

  const sameDay = start && end && start.toDateString() === end.toDateString();

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

      {/* Generative poster — clipped to fixed height to act as event banner */}
      <div className="relative overflow-hidden mb-6 border border-white/6" style={{ height: "200px" }}>
        <EventPlaceholder name={event?.eventName ?? address} />
        {/* Smooth bottom fade into page background */}
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
              {fmtDate(start)}
              {end && end.toDateString() !== start.toDateString() ? ` → ${fmtDate(end)}` : ""}
            </span>
          )}
        </div>
      )}

      {/* Description */}
      {desc && (
        <div className="mb-6">
          <p className={`text-sm text-zinc-400 leading-relaxed ${
            !expanded && longDesc ? "line-clamp-3" : ""
          }`}>
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

      {/* Location map — shown when lat/lng are known */}
      {event?.latitude != null && event?.longitude != null && (
        <div className="mb-6 border border-white/8 overflow-hidden">
          {/* Map — isolate creates a stacking context so Leaflet's internal z-indexes (400–1000) don't escape above the navbar */}
          <div style={{ height: 240 }} className="isolate">
            <EventLocationMap
              lat={event.latitude}
              lng={event.longitude}
              label={location ?? event.eventName}
            />
          </div>
          {/* Footer bar */}
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

      {/* Ticket-stub stats: STARTS | ENDS | CAPACITY  (same-day: DATE | TIME | CAPACITY) */}
      {event && (
        <div className="grid grid-cols-3 border border-white/8 divide-x divide-white/8 mb-5">
          {sameDay && start && end ? (
            <>
              {/* Same-day event: one DATE cell + one TIME RANGE cell */}
              <div className="px-4 py-4">
                <p className="text-[9px] font-mono font-semibold text-zinc-700 tracking-widest mb-2">DATE</p>
                {(() => { const d = fmtBig(start); return (
                  <>
                    <p className="text-2xl font-black text-white tabular-nums leading-none">{d.day}</p>
                    <p className="text-xs font-mono text-zinc-400 mt-1">{d.month} {d.year}</p>
                    <p className="text-[10px] font-mono text-zinc-700 mt-0.5">{d.dow}</p>
                  </>
                ); })()}
              </div>
              <div className="px-4 py-4">
                <p className="text-[9px] font-mono font-semibold text-zinc-700 tracking-widest mb-2">TIME</p>
                <p className="text-lg font-black text-white tabular-nums leading-none">{fmtBig(start).time}</p>
                <p className="text-[10px] font-mono text-zinc-600 mt-1">START</p>
                <p className="text-lg font-black text-white tabular-nums leading-none mt-2">{fmtBig(end).time}</p>
                <p className="text-[10px] font-mono text-zinc-600 mt-1">END</p>
              </div>
            </>
          ) : (
            statRows.map(({ label, date }) => {
              const d = date ? fmtBig(date) : null;
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
            {/* time-status badge */}
            {(() => {
              const ts = (() => {
                const now = new Date();
                if (end && end < now) return "past" as const;
                if (start && start > now) return "upcoming" as const;
                return "now" as const;
              })();
              const badgeCls =
                ts === "now"      ? "text-emerald-400 border-emerald-500/25 bg-emerald-500/[0.06]" :
                ts === "upcoming" ? "text-sky-400    border-sky-500/25    bg-sky-500/[0.06]" :
                                    "text-zinc-600   border-zinc-700/40   bg-white/[0.02]";
              const badgeLabel =
                ts === "now" ? "Happening now" : ts === "upcoming" ? "Upcoming" : "Past";
              return (
                <span className={`inline-block mt-2 text-[9px] font-mono font-semibold border px-1.5 py-0.5 leading-none ${badgeCls}`}>
                  {badgeLabel}
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

// ─── Organizer view ───────────────────────────────────────────────────────────

// QR scanner mounted dynamically to avoid SSR issues.
const QrScannerWidget = dynamic<{ onScan: (r: string) => boolean; onError?: (e: string) => void }>(
  () => import("@/components/QrScannerWidget"),
  {
    ssr: false,
    loading: () => (
      <div className="w-full aspect-square bg-black flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    ),
  }
);

function OrganizerView({
  address,
  event,
}: {
  address: string;
  event: StoredEvent;
}) {
  const { wallet, connect } = useWallet();
  const [tab, setTab] = useState<"admit" | "stats" | "info">("admit");

  // ── Admit state ──────────────────────────────────────────────────────────
  const [admitMode, setAdmitMode] = useState<"scan" | "manual">("manual");
  const [nonceInput, setNonceInput] = useState("");
  const [admitting, setAdmitting] = useState(false);
  const [admitRetry, setAdmitRetry] = useState<{ attempt: number; max: number } | null>(null);
  const [admitResult, setAdmitResult] = useState<"success" | "error" | null>(null);
  const [admitError, setAdmitError] = useState<string | null>(null);
  const [lastAdmittedAt, setLastAdmittedAt] = useState<Date | null>(null);
  const [lastAdmittedNonce, setLastAdmittedNonce] = useState<string | null>(null);
  const [scanActive, setScanActive] = useState(false);
  const [cameraPermissionDenied, setCameraPermissionDenied] = useState(false);
  const [pendingNonce, setPendingNonce] = useState<string | null>(null);
  // claimTxId extracted from QR — used to update the backend ticket record after admit.
  const [pendingClaimTxId, setPendingClaimTxId] = useState<string | null>(null);
  // Session-local set of admitted nonces — survives tab changes but not page refresh.
  const [admittedNonces, setAdmittedNonces] = useState<Set<string>>(new Set());

  // ── Event status ─────────────────────────────────────────────────────────
  const [eventStatus, setEventStatus] = useState<EventStatus>("active");
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  // ── Stats / attendees ────────────────────────────────────────────────────
  const [tickets, setTickets] = useState<TicketRecord[] | null>(null);
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [backendEventId, setBackendEventId] = useState<string | null>(null);

  // ── On-chain state (for real minAge) ─────────────────────────────────────
  const [onChainMinAge, setOnChainMinAge] = useState<number>(event.minAge ?? 0);
  const [onChainIssued, setOnChainIssued] = useState<number | null>(null);

  useEffect(() => {
    import("@sdk/contract-api").then(({ readPublicState }) =>
      import("@sdk/types").then(({ PREPROD_CONFIG }) =>
        readPublicState(address, PREPROD_CONFIG)
          .then((s) => {
            console.log("[OrganizerView] on-chain state:", s);
            setOnChainMinAge(Number(s.minAge));
            setOnChainIssued(Number(s.ticketsIssued));
          })
          .catch((err) => console.error("[OrganizerView] readPublicState failed:", err))
      )
    );
  }, [address]);

  // Fetch backend event id + tickets when stats tab opens.
  useEffect(() => {
    if (tab !== "stats" && tab !== "admit") return;
    backendApi.events.byAddress(address).then((ev) => {
      setBackendEventId(ev.id);
      setTicketsLoading(true);
      return backendApi.tickets.byEvent(ev.id);
    }).then((t) => {
      setTickets(t);
    }).catch(() => {}).finally(() => setTicketsLoading(false));
  }, [address, tab]);

  async function buildApi() {
    const liveWallet = wallet ?? await connect();
    const secretHex = getCallerSecret(address);
    if (!secretHex) throw new Error("Organizer secret not found in storage.");
    const [{ createEventTicketProviders }, { EventTicketAPI, hexToBigint }, { PREPROD_CONFIG }] =
      await Promise.all([
        import("@sdk/providers"),
        import("@sdk/contract-api"),
        import("@sdk/types"),
      ]);
    const providers = await createEventTicketProviders(liveWallet, PREPROD_CONFIG);
    return EventTicketAPI.join(providers, address, hexToBigint(secretHex));
  }

  async function changeStatus(action: "pause" | "resume" | "cancel") {
    setStatusLoading(true);
    setStatusError(null);
    try {
      const contractApi = await buildApi();
      if (action === "pause")  await contractApi.pauseEvent();
      if (action === "resume") await contractApi.resumeEvent();
      if (action === "cancel") await contractApi.cancelEvent();
      setEventStatus(action === "pause" ? "paused" : action === "cancel" ? "cancelled" : "active");
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : String(err));
    } finally {
      setStatusLoading(false);
    }
  }

  async function submitAdmit(rawNonce: string, claimTxId?: string | null) {
    const trimmed = rawNonce.trim();
    if (!trimmed || admitting) return;
    setAdmitting(true);
    setAdmitResult(null);
    setAdmitError(null);
    setAdmitRetry(null);
    setScanActive(false);

    const MAX_RETRIES = 3;
    const RETRY_DELAY_MS = 4_000; // give the wallet time to sync

    let lastErr: unknown;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const contractApi = await buildApi();
        const { hexToBigint } = await import("@sdk/contract-api");
        const nonce = hexToBigint(trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`);
        await contractApi.admitTicket(nonce);
        setAdmitResult("success");
        setAdmitRetry(null);
        setLastAdmittedAt(new Date());
        setLastAdmittedNonce(trimmed);
        setAdmittedNonces((prev) => new Set([...prev, trimmed]));
        setNonceInput("");
        // Update the backend ticket record (non-fatal — on-chain tx already succeeded).
        if (claimTxId) {
          backendApi.tickets.admit(claimTxId).catch(() => {});
        }
        // Refresh ticket list
        if (backendEventId) {
          backendApi.tickets.byEvent(backendEventId).then(setTickets).catch(() => {});
        }
        setAdmitting(false);
        return;
      } catch (err) {
        lastErr = err;
        const msg = err instanceof Error ? err.message : String(err);
        const isTimeout = msg.toLowerCase().includes("timed out") || msg.toLowerCase().includes("timeout");
        // Only retry on transient timeout errors; stop immediately for "already used" and other logic errors
        if (!isTimeout || attempt === MAX_RETRIES) break;
        setAdmitRetry({ attempt, max: MAX_RETRIES });
        await new Promise<void>((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      }
    }

    setAdmitRetry(null);
    setAdmitResult("error");
    setAdmitError(lastErr instanceof Error ? lastErr.message : String(lastErr));
    setAdmitting(false);
  }

  function handleQrScan(raw: string): boolean {
    // Only accept our ticket format: {"contractAddress":"…","nonce":"0x…"[,"claimTxId":"…"]}
    try {
      const parsed = JSON.parse(raw) as { contractAddress?: string; nonce?: string; claimTxId?: string };
      if (
        typeof parsed.contractAddress === "string" &&
        typeof parsed.nonce === "string" &&
        parsed.nonce.startsWith("0x")
      ) {
        setScanActive(false);
        setPendingNonce(parsed.nonce);
        setPendingClaimTxId(typeof parsed.claimTxId === "string" ? parsed.claimTxId : null);
        return true; // consumed — stop scanning
      }
    } catch { /* not JSON — ignore */ }
    // Unknown QR format — keep scanning
    console.warn("[QrScanner] ignored non-ticket QR:", raw.slice(0, 60));
    return false;
  }

  function resetAdmit() {
    setAdmitResult(null);
    setAdmitError(null);
    setNonceInput("");
    setPendingNonce(null);
    setPendingClaimTxId(null);
    setScanActive(admitMode === "scan");
  }

  const isCancelled = eventStatus === "cancelled";
  const admittedCount = tickets?.filter((t) => t.isVerified).length ?? 0;
  const claimedCount = tickets?.length ?? (event.claimedCount ?? 0);
  const issuedCount = onChainIssued ?? claimedCount;
  const fillPct = event.totalTickets > 0 ? Math.min(100, (issuedCount / event.totalTickets) * 100) : 0;

  return (
    <div>
      {/* Status controls */}
      <div className="flex items-center gap-2 mb-6 flex-wrap">
        <span className={`text-xs border px-2.5 py-1 ${
          isCancelled ? "border-red-500/30 text-red-400"
          : eventStatus === "paused" ? "border-yellow-500/30 text-yellow-400"
          : "border-emerald-500/30 text-emerald-400"
        }`}>
          {isCancelled ? "Cancelled" : eventStatus === "paused" ? "Paused" : "Active"}
        </span>
        {!isCancelled && (
          <>
            {eventStatus === "active" ? (
              <button onClick={() => changeStatus("pause")} disabled={statusLoading}
                className="text-xs text-zinc-400 hover:text-yellow-400 border border-white/8 hover:border-yellow-500/30 px-2.5 py-1 transition-colors disabled:opacity-30">
                {statusLoading ? "…" : "Pause"}
              </button>
            ) : (
              <button onClick={() => changeStatus("resume")} disabled={statusLoading}
                className="text-xs text-zinc-400 hover:text-emerald-400 border border-white/8 hover:border-emerald-500/30 px-2.5 py-1 transition-colors disabled:opacity-30">
                {statusLoading ? "…" : "Resume"}
              </button>
            )}
            <button
              onClick={() => { if (confirm("Cancel this event permanently? This cannot be undone.")) changeStatus("cancel"); }}
              disabled={statusLoading}
              className="text-xs text-zinc-600 hover:text-red-400 border border-white/8 hover:border-red-500/30 px-2.5 py-1 transition-colors disabled:opacity-30">
              Cancel event
            </button>
          </>
        )}
      </div>

      {statusError && <ErrorBox message={statusError} />}

      <OrganizerKeyExport contractAddress={address} eventName={event.eventName} />

      {/* Tabs */}
      <div className="flex gap-0 border-b border-white/8 mb-6">
        {(["admit", "stats", "info"] as const).map((id) => (
          <button key={id} onClick={() => setTab(id)}
            className={`px-4 py-2.5 text-xs font-medium -mb-px border-b-2 transition-colors tracking-wide uppercase ${
              tab === id ? "border-white text-white" : "border-transparent text-zinc-600 hover:text-zinc-300"
            }`}>
            {id === "admit" ? "Admit" : id === "stats" ? "Attendees" : "Event Info"}
          </button>
        ))}
      </div>

      {/* ── Tab: Admit ─────────────────────────────────────────────────── */}
      {tab === "admit" && (
        <div className="space-y-5">
          {/* Success overlay */}
          <AnimatePresence>
            {admitResult === "success" && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ type: "spring", stiffness: 400, damping: 28 }}
                className="border border-emerald-500/25 bg-emerald-500/[0.05] px-5 py-6 flex flex-col items-center gap-4 text-center"
              >
                {/* Pulse ring + checkmark */}
                <div className="relative flex items-center justify-center">
                  <motion.div
                    initial={{ scale: 0.6, opacity: 0.8 }}
                    animate={{ scale: 1.8, opacity: 0 }}
                    transition={{ duration: 1.1, ease: "easeOut" }}
                    className="absolute w-12 h-12 rounded-full bg-emerald-500/30"
                  />
                  <motion.div
                    initial={{ scale: 0, rotate: -20 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: "spring", stiffness: 500, damping: 22, delay: 0.05 }}
                    className="relative w-12 h-12 rounded-full bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center"
                  >
                    <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                      <motion.path
                        strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5"
                        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
                        transition={{ duration: 0.4, delay: 0.15, ease: "easeOut" }}
                      />
                    </svg>
                  </motion.div>
                </div>
                <div>
                  <p className="text-sm font-bold text-emerald-400 tracking-wide uppercase">Attendee Admitted</p>
                  <p className="text-xs text-zinc-500 mt-1">Ticket marked as used on-chain</p>
                  {lastAdmittedAt && (
                    <p className="text-[10px] font-mono text-zinc-700 mt-0.5">
                      {lastAdmittedAt.toLocaleTimeString("en-GB")}
                    </p>
                  )}
                  {lastAdmittedNonce && (
                    <p className="text-[10px] font-mono text-zinc-700 mt-0.5">
                      {lastAdmittedNonce.slice(0, 12)}…{lastAdmittedNonce.slice(-8)}
                    </p>
                  )}
                </div>
                <button
                  onClick={resetAdmit}
                  className="text-xs font-semibold text-white border border-white/15 bg-white/[0.04] hover:bg-white/[0.08] px-5 py-2 transition-colors"
                >
                  Scan Next →
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Error state */}
          <AnimatePresence>
            {admitResult === "error" && admitError && (() => {
              const isAlreadyUsed =
                admitError.toLowerCase().includes("already used") ||
                admitError.toLowerCase().includes("ticket already");
              return (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className={`border px-4 py-4 space-y-3 ${
                    isAlreadyUsed
                      ? "border-amber-500/25 bg-amber-500/[0.05]"
                      : "border-red-500/20 bg-red-500/[0.04]"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {isAlreadyUsed ? (
                      <svg className="w-4 h-4 text-amber-400 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4 text-red-400 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                      </svg>
                    )}
                    <p className={`text-sm font-semibold ${isAlreadyUsed ? "text-amber-400" : "text-red-400"}`}>
                      {isAlreadyUsed ? "Ticket already admitted" : "Admission failed"}
                    </p>
                  </div>
                  <p className={`text-xs leading-relaxed ${isAlreadyUsed ? "text-amber-300/60" : "text-red-300/70 break-all"}`}>
                    {isAlreadyUsed
                      ? "This ticket has already been scanned and admitted at the venue. Do not let this attendee in again."
                      : admitError}
                  </p>
                  <button onClick={resetAdmit}
                    className="text-xs text-zinc-400 hover:text-white border border-white/8 hover:border-white/20 px-3 py-1.5 transition-colors">
                    {isAlreadyUsed ? "Scan next ticket →" : "Try again"}
                  </button>
                </motion.div>
              );
            })()}
          </AnimatePresence>

          {/* Main admit UI (hidden while showing result) */}
          {admitResult === null && (
            <>
              {/* Mode toggle */}
              <div className="flex gap-0 border border-white/8 p-1 bg-white/[0.02]">
                {(["scan", "manual"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => { setAdmitMode(m); setScanActive(m === "scan"); if (m === "scan") setCameraPermissionDenied(false); }}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors ${
                      admitMode === m
                        ? "bg-white text-black"
                        : "text-zinc-500 hover:text-white"
                    }`}
                  >
                    {m === "scan" ? (
                      <>
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 3.75 9.375v-4.5ZM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 0 1-1.125-1.125v-4.5ZM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 13.5 9.375v-4.5Z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 6.75h.75v.75h-.75v-.75ZM6.75 16.5h.75v.75h-.75v-.75ZM16.5 6.75h.75v.75h-.75v-.75ZM13.5 13.5h.75v.75h-.75v-.75ZM13.5 19.5h.75v.75h-.75v-.75ZM19.5 13.5h.75v.75h-.75v-.75ZM19.5 19.5h.75v.75h-.75v-.75ZM16.5 16.5h.75v.75h-.75v-.75Z" />
                        </svg>
                        Scan QR
                      </>
                    ) : (
                      <>
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
                        </svg>
                        Manual
                      </>
                    )}
                  </button>
                ))}
              </div>

              {/* QR scanner panel */}
              {admitMode === "scan" && (
                <AnimatePresence mode="wait">
                  {!pendingNonce ? (
                    /* ── Camera viewfinder ─────────────────────────────── */
                    <motion.div
                      key="viewfinder"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0, scale: 0.97 }}
                      transition={{ duration: 0.18 }}
                      className="space-y-2"
                    >
                      <div className="relative border border-white/8 bg-black" style={{ aspectRatio: "1/1", minHeight: "260px" }}>
                        {scanActive && !admitting && (
                          <QrScannerWidget
                            onScan={handleQrScan}
                            onError={(msg) => {
                              setScanActive(false);
                              if (msg.includes("NotAllowed") || msg.includes("Permission") || msg.includes("permission")) {
                                setAdmitMode("manual");
                                setCameraPermissionDenied(true);
                              } else {
                                setAdmitError(msg);
                                setAdmitResult("error");
                              }
                            }}
                          />
                        )}
                        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                          <div className="relative w-48 h-48">
                            {[["top-0 left-0", "border-t border-l"],
                              ["top-0 right-0", "border-t border-r"],
                              ["bottom-0 left-0", "border-b border-l"],
                              ["bottom-0 right-0", "border-b border-r"]].map(([pos, cls], i) => (
                              <span key={i} className={`absolute ${pos} w-6 h-6 ${cls} border-white/70`} />
                            ))}
                            {scanActive && !admitting && (
                              <motion.div
                                className="absolute left-0 right-0 h-px bg-white/50 shadow-[0_0_6px_1px_rgba(255,255,255,0.5)]"
                                animate={{ top: ["8%", "92%", "8%"] }}
                                transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
                              />
                            )}
                            {admitting && (
                              <div className="absolute inset-0 flex items-center justify-center">
                                <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      <p className="text-xs text-zinc-600 text-center">
                        {admitting
                          ? admitRetry
                            ? `Wallet syncing, retrying… (${admitRetry.attempt}/${admitRetry.max})`
                            : "Submitting ZK proof…"
                          : "Point camera at attendee's ticket QR code"}
                      </p>
                    </motion.div>
                  ) : (
                    /* ── Ticket scanned confirm card ───────────────────── */
                    <motion.div
                      key="confirm"
                      initial={{ opacity: 0, y: 20, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ type: "spring", stiffness: 360, damping: 30 }}
                      className={`border overflow-hidden ${
                        admittedNonces.has(pendingNonce)
                          ? "border-amber-500/25 bg-amber-500/[0.04]"
                          : "border-emerald-500/25 bg-emerald-500/[0.04]"
                      }`}
                    >
                      <motion.div
                        className={`h-0.5 bg-gradient-to-r ${
                          admittedNonces.has(pendingNonce)
                            ? "from-amber-500 to-yellow-400"
                            : "from-emerald-500 to-teal-400"
                        }`}
                        initial={{ scaleX: 0, originX: 0 }}
                        animate={{ scaleX: 1 }}
                        transition={{ delay: 0.12, duration: 0.35, ease: "easeOut" }}
                      />
                      <div className="px-5 py-5 space-y-4">
                        <div className="flex items-center gap-3">
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ type: "spring", stiffness: 420, damping: 18, delay: 0.14 }}
                            className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                              admittedNonces.has(pendingNonce)
                                ? "bg-amber-500/15 border border-amber-500/30"
                                : "bg-emerald-500/15 border border-emerald-500/30"
                            }`}
                          >
                            {admittedNonces.has(pendingNonce) ? (
                              <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                              </svg>
                            ) : (
                              <svg className="w-4.5 h-4.5 text-emerald-400" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75" />
                              </svg>
                            )}
                          </motion.div>
                          <motion.div
                            initial={{ opacity: 0, x: -6 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.2, duration: 0.22 }}
                          >
                            {admittedNonces.has(pendingNonce) ? (
                              <>
                                <p className="text-sm font-semibold text-amber-400">Already admitted</p>
                                <p className="text-[11px] text-zinc-500">This ticket was admitted earlier this session</p>
                              </>
                            ) : (
                              <>
                                <p className="text-sm font-semibold text-white">Ticket scanned</p>
                                <p className="text-[11px] text-zinc-500">Valid ticket — confirm to admit</p>
                              </>
                            )}
                          </motion.div>
                        </div>
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: 0.26 }}
                          className="bg-black/40 border border-white/6 px-3 py-2.5"
                        >
                          <p className="text-[9px] font-mono text-zinc-600 uppercase tracking-widest mb-1">Ticket nonce</p>
                          <p className="text-xs font-mono text-zinc-300 break-all">
                            {pendingNonce.slice(0, 14)}<span className="text-zinc-600">…</span>{pendingNonce.slice(-10)}
                          </p>
                        </motion.div>
                        <motion.div
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.32 }}
                          className="flex gap-2 pt-1"
                        >
                          <button
                            onClick={() => { setPendingNonce(null); setScanActive(true); }}
                            className="flex-1 text-xs text-zinc-400 hover:text-white border border-white/8 hover:border-white/20 py-3 transition-colors"
                          >
                            {admittedNonces.has(pendingNonce) ? "Scan next →" : "Re-scan"}
                          </button>
                          {!admittedNonces.has(pendingNonce) && (
                            <button
                              onClick={() => submitAdmit(pendingNonce, pendingClaimTxId)}
                              disabled={isCancelled}
                              className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold py-3 disabled:opacity-30 transition-colors"
                            >
                              Confirm Admit
                            </button>
                          )}
                        </motion.div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              )}

              {/* Manual nonce input */}
              {admitMode === "manual" && (
                <div className="space-y-3">
                  {cameraPermissionDenied && (
                    <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 px-3 py-2.5 text-xs text-amber-400">
                      <svg className="w-3.5 h-3.5 mt-0.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
                      <span>Camera access denied. Allow camera permission in your browser settings to use the scanner, or enter the nonce manually below.</span>
                    </div>
                  )}
                  <div>
                    <label className="block text-[10px] font-mono font-semibold text-zinc-600 tracking-widest uppercase mb-2">
                      Ticket nonce
                    </label>
                    <input
                      type="text"
                      placeholder="0x…"
                      value={nonceInput}
                      onChange={(e) => setNonceInput(e.target.value)}
                      disabled={admitting || isCancelled}
                      className="w-full bg-white/[0.03] border border-white/8 px-4 py-3 text-sm text-white font-mono placeholder-zinc-700 focus:outline-none focus:border-white/25 disabled:opacity-40 transition-colors"
                    />
                  </div>
                  <button
                    onClick={() => submitAdmit(nonceInput)}
                    disabled={admitting || !nonceInput.trim() || isCancelled}
                    className="w-full bg-white text-black text-sm font-semibold py-3 hover:bg-zinc-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    {admitting
                      ? admitRetry
                        ? `Wallet syncing, retrying… (${admitRetry.attempt}/${admitRetry.max})`
                        : "Submitting ZK proof…"
                      : isCancelled ? "Event is cancelled" : "Admit Attendee"}
                  </button>
                </div>
              )}

              {isCancelled && (
                <p className="text-xs text-zinc-600 text-center">This event has been cancelled.</p>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Tab: Attendees / Stats ─────────────────────────────────────── */}
      {tab === "stats" && (
        <div className="space-y-5">
          {/* Live counters */}
          <div className="grid grid-cols-3 border border-white/8 divide-x divide-white/8">
            {[
              { label: "CAPACITY", value: event.totalTickets, sub: "max seats" },
              { label: "CLAIMED", value: onChainIssued ?? claimedCount, sub: "on-chain" },
              { label: "ADMITTED", value: admittedCount, sub: "scanned in" },
            ].map(({ label, value, sub }) => (
              <div key={label} className="px-4 py-4">
                <p className="text-[9px] font-mono font-semibold text-zinc-700 tracking-widest mb-2">{label}</p>
                <p className="text-2xl font-black text-white tabular-nums leading-none">{value}</p>
                <p className="text-[10px] font-mono text-zinc-600 mt-1">{sub}</p>
              </div>
            ))}
          </div>

          {/* Fill bar */}
          {event.totalTickets > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[10px] font-mono text-zinc-600">
                <span>Ticket fill rate</span>
                <span>{fillPct.toFixed(2)}%</span>
              </div>
              <div className="h-1.5 bg-white/[0.04] overflow-hidden">
                <motion.div
                  className="h-full bg-white/30"
                  initial={{ width: 0 }}
                  animate={{ width: `${fillPct}%` }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                />
              </div>
              {admittedCount > 0 && (
                <div className="h-1.5 bg-white/[0.04] overflow-hidden">
                  <motion.div
                    className="h-full bg-emerald-500/50"
                    initial={{ width: 0 }}
                    animate={{ width: `${event.totalTickets > 0 ? Math.min(100, (admittedCount / event.totalTickets) * 100) : 0}%` }}
                    transition={{ duration: 0.8, ease: "easeOut", delay: 0.1 }}
                  />
                </div>
              )}
              <p className="text-[10px] font-mono text-zinc-700">
                <span className="text-white/30">■</span> Claimed &nbsp;
                <span className="text-emerald-500/50">■</span> Admitted
              </p>
            </div>
          )}

          {/* Ticket list */}
          <div>
            <p className="text-[9px] font-mono font-semibold text-zinc-700 tracking-widest uppercase mb-3">Ticket log</p>
            {ticketsLoading ? (
              <div className="space-y-2">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-12 bg-white/[0.02] border border-white/6 animate-pulse" />
                ))}
              </div>
            ) : !tickets || tickets.length === 0 ? (
              <div className="border border-white/6 bg-white/[0.02] px-4 py-6 text-center">
                <p className="text-xs text-zinc-600">No tickets claimed yet</p>
              </div>
            ) : (
              <div className="border border-white/8 divide-y divide-white/6">
                {[...tickets].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map((t) => (
                  <div key={t.id} className="flex items-center gap-3 px-4 py-3">
                    {/* Status dot */}
                    <span className={`shrink-0 w-1.5 h-1.5 rounded-full ${t.isVerified ? "bg-emerald-500" : "bg-white/20"}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-mono text-zinc-500 truncate">{t.claimTxId.slice(0, 28)}…</p>
                      <p className="text-[10px] text-zinc-700 mt-0.5">
                        {new Date(t.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}{" "}
                        {new Date(t.createdAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                    <span className={`shrink-0 text-[9px] font-mono font-semibold border px-1.5 py-0.5 ${
                      t.isVerified
                        ? "text-emerald-400 border-emerald-500/25 bg-emerald-500/[0.06]"
                        : "text-zinc-600 border-zinc-700/40"
                    }`}>
                      {t.isVerified ? "ADMITTED" : "CLAIMED"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Tab: Event Info ────────────────────────────────────────────── */}
      {tab === "info" && (
        <div className="space-y-4">
          <div className="border border-white/8 divide-y divide-white/6">
            <div className="flex items-center justify-between px-4 py-3">
              <p className="text-xs text-zinc-500">Total capacity</p>
              <p className="text-sm font-mono text-white">{event.totalTickets}</p>
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <p className="text-xs text-zinc-500">Min age</p>
              <div className="text-right">
                <p className="text-sm font-mono text-white">
                  {onChainMinAge > 0 ? `${onChainMinAge}+` : "No restriction"}
                </p>
                <p className="text-[10px] font-mono text-zinc-700 mt-0.5">from chain</p>
              </div>
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <p className="text-xs text-zinc-500">Tickets issued on-chain</p>
              <p className="text-sm font-mono text-white">
                {onChainIssued !== null ? onChainIssued : "—"}
              </p>
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <p className="text-xs text-zinc-500">Contract</p>
              <p className="text-xs font-mono text-zinc-400 truncate max-w-[180px]">{address}</p>
            </div>
          </div>
          <ShareHint address={address} />
        </div>
      )}
    </div>
  );
}

// ─── Attendee view ────────────────────────────────────────────────────────────

/**
 * Extract the contract assertion message from the SDK's verbose error wrapper:
 *   "Unexpected error executing scoped transaction '<unnamed>': Error: failed assert: Age requirement not met"
 * and map it to a friendly user-facing string.
 */
function parseContractError(err: unknown, minAge: number): string {
  const raw = err instanceof Error ? err.message : String(err);

  // Pull out just the assertion text after "failed assert:"
  const assertMatch = raw.match(/failed assert:\s*(.+?)(?:\n|$)/i);
  const assertion = assertMatch?.[1]?.trim() ?? null;

  if (assertion) {
    switch (assertion) {
      case "Age requirement not met":
        return `You must be at least ${minAge} years old to attend this event.`;
      case "Invalid birth year":
        return "The date of birth you entered is invalid. Please check and try again.";
      case "Event is sold out":
        return "Sorry, this event is sold out — no tickets remain.";
      case "Event is not active":
        return "Ticket claims are currently paused for this event.";
      case "Event is cancelled":
        return "This event has been cancelled. Tickets can no longer be claimed.";
      default:
        return assertion; // return the assertion text itself, at least no SDK noise
    }
  }

  // No assertion found — return a sanitised generic message without SDK internals
  if (raw.includes("scoped transaction") || raw.includes("failed assert")) {
    return "The transaction was rejected by the contract. Please check your details and try again.";
  }

  return raw;
}

function AttendeeView({
  address,
  event,
}: {
  address: string;
  event: StoredEvent | null;
}) {
  const { wallet, connect } = useWallet();
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [showDobModal, setShowDobModal] = useState(false);
  const [dob, setDob] = useState("");
  // Check if a ticket for this event is already saved locally
  const existingTicket = getMyTickets().find((t) => t.contractAddress === address);
  const [savedTicket, setSavedTicket] = useState(existingTicket ?? null);

  // On-chain minAge — starts from the prop (backend/localStorage value) but is
  // overridden by the authoritative on-chain value once it loads.
  // This ensures old events created before minAge was persisted still work correctly.
  const [onChainMinAge, setOnChainMinAge] = useState<number>(event?.minAge ?? 0);

  // Load the real minAge from the on-chain contract state (no wallet required).
  useEffect(() => {
    import("@sdk/contract-api").then(({ readPublicState }) =>
      import("@sdk/types").then(({ PREPROD_CONFIG }) =>
        readPublicState(address, PREPROD_CONFIG)
          .then((state) => {
            console.log("[AttendeeView] on-chain state:", state);
            setOnChainMinAge(Number(state.minAge));
          })
          .catch((err) => console.error("[AttendeeView] readPublicState failed:", err))
      )
    );
  }, [address]);

  // Retroactively sync an existing local ticket to the backend if it was claimed
  // before this sync logic existed. Only possible if claimTxId was saved.
  useEffect(() => {
    if (!existingTicket?.claimTxId) return;
    const txId = existingTicket.claimTxId;
    backendApi.events.byAddress(address)
      .then((ev) =>
        backendApi.tickets.issue({
          claimTxId: txId,
          eventId: ev.id,
        })
      )
      .catch(() => {/* already synced (409) or backend down — ignore */});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  // Silent admission sync — check if this ticket was admitted since last visit.
  useEffect(() => {
    if (savedTicket?.isUsed) return; // already known
    backendApi.tickets.mine().then((backendTickets) => {
      const bt = backendTickets.find((t) => t.claimTxId === savedTicket?.claimTxId);
      if (bt?.isVerified && savedTicket) {
        markTicketUsed(savedTicket.id, bt.verifiedAt ?? undefined);
        setSavedTicket({ ...savedTicket, isUsed: true, usedAt: bt.verifiedAt ?? new Date().toISOString() });
      }
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleClaim(e: React.FormEvent) {
    e.preventDefault();
    if (!dob) return;

    // ── Client-side age check — instant feedback before the ZK proof starts ──
    if (minAge > 0) {
      const birthYear = new Date(dob).getFullYear();
      const currentYear = new Date().getFullYear();
      if (currentYear - birthYear < minAge) {
        setClaimError(
          `You must be at least ${minAge} years old to attend this event. ` +
          `Based on the year you entered, you are ${currentYear - birthYear} years old.`
        );
        return;
      }
    }

    setClaiming(true);
    setClaimError(null);
    try {
      const liveWallet = wallet ?? await connect();
      const birthYear = new Date(dob).getFullYear();
      const [{ createEventTicketProviders }, { EventTicketAPI }, { PREPROD_CONFIG }] =
        await Promise.all([
          import("@sdk/providers"),
          import("@sdk/contract-api"),
          import("@sdk/types"),
        ]);
      const providers = await createEventTicketProviders(liveWallet, PREPROD_CONFIG);
      const contractApi = await EventTicketAPI.joinAsAttendee(providers, address);
      const { nonce, txId } = await contractApi.claimTicket(birthYear);
      const secret = contractApi.ticketSecret(nonce);
      const ticket = {
        id: crypto.randomUUID(),
        contractAddress: address,
        eventName: event?.eventName ?? address,
        claimTxId: txId,
        secret,
        receivedAt: new Date().toISOString(),
      };
      saveTicket(ticket);
      setSavedTicket(ticket);
      setShowDobModal(false);

      // Sync the claimed ticket to the backend so claimedCount stays accurate.
      // Non-fatal: the ticket is already secured on-chain and in localStorage.
      try {
        const backendEvent = await backendApi.events.byAddress(address);
        await backendApi.tickets.issue({
          claimTxId: txId,   // public on-chain txId — never the private nonce
          eventId: backendEvent.id,
        });
      } catch {
        console.warn("[ticket] Backend sync failed — ticket is on-chain but not in DB.");
      }
    } catch (err) {
      setClaimError(parseContractError(err, minAge));
    } finally {
      setClaiming(false);
    }
  }

  if (savedTicket) {
    const qrValue = JSON.stringify(
      savedTicket.claimTxId
        ? { ...savedTicket.secret, claimTxId: savedTicket.claimTxId }
        : savedTicket.secret,
    );
    const admittedDate = savedTicket.usedAt ? new Date(savedTicket.usedAt) : null;
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="space-y-0"
      >
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="mb-5"
        >
          <p className="text-[10px] font-mono font-semibold text-zinc-600 uppercase tracking-widest mb-1">Your ticket</p>
          <h2 className={`text-lg font-bold ${savedTicket.isUsed ? "text-zinc-400" : "text-white"}`}>{savedTicket.eventName}</h2>
        </motion.div>

        {/* Ticket stub */}
        <motion.div
          initial={{ opacity: 0, y: 32, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 28, delay: 0.1 }}
          className={`relative border overflow-hidden transition-colors ${
            savedTicket.isUsed
              ? "border-amber-500/20 bg-amber-500/[0.03]"
              : "border-white/10 bg-white/[0.02]"
          }`}
        >
          {/* Top accent bar */}
          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ delay: 0.35, duration: 0.5, ease: "easeOut" }}
            style={{ originX: 0 }}
            className={`h-px bg-gradient-to-r ${
              savedTicket.isUsed
                ? "from-amber-500/60 via-amber-400/20 to-transparent"
                : "from-emerald-500/60 via-white/20 to-transparent"
            }`}
          />

          {/* QR area */}
          <div className="flex flex-col items-center gap-0 px-6 pt-7 pb-5">
            {savedTicket.isUsed ? (
              /* ══ ADMITTED STATE ════════════════════════════════════ */
              <>
                {/* Void QR + rubber stamp */}
                <div className="relative w-[212px] h-[212px] bg-zinc-900 border border-amber-500/15 flex items-center justify-center">
                  {/* desaturated QR underneath */}
                  <div style={{ filter: "grayscale(1) opacity(0.15)" }}>
                    <QRCode value={qrValue} size={176} />
                  </div>
                  {/* Animated circular stamp */}
                  <motion.div
                    initial={{ scale: 2.2, opacity: 0, rotate: -28 }}
                    animate={{ scale: 1, opacity: 1, rotate: -14 }}
                    transition={{ type: "spring", stiffness: 500, damping: 24 }}
                    className="absolute inset-0 flex items-center justify-center"
                  >
                    <div className="relative flex items-center justify-center w-[168px] h-[168px]">
                      <div className="absolute inset-0 rounded-full border-[3px] border-amber-400/85 shadow-[0_0_30px_rgba(245,158,11,0.22)]" />
                      <div className="absolute inset-[7px] rounded-full border border-amber-400/30" />
                      <div className="flex flex-col items-center gap-0.5 z-10">
                        <p className="text-amber-400 font-black text-[21px] leading-none tracking-[0.32em]">ADMITTED</p>
                        <div className="w-[88px] h-px bg-amber-400/50 my-1.5" />
                        <p className="text-amber-400/65 text-[9px] font-bold tracking-[0.28em] uppercase">Entry Granted</p>
                        {admittedDate && (
                          <p className="text-amber-400/45 text-[9px] font-mono mt-1.5">
                            {admittedDate.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                          </p>
                        )}
                      </div>
                    </div>
                  </motion.div>
                </div>

                {/* Admission record strip */}
                <div className="w-full border border-t-0 border-amber-500/15 bg-amber-500/[0.05] px-4 py-3 flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full border border-amber-500/35 bg-amber-500/10 flex items-center justify-center shrink-0">
                    <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
                      <path d="M1 5L4.5 8.5L11 1" stroke="rgb(251 191 36)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-amber-400/85">Admitted at venue</p>
                    <p className="text-[11px] text-zinc-500 mt-0.5">
                      {admittedDate ? admittedDate.toLocaleString() : "Admission recorded on-chain"}
                    </p>
                  </div>
                </div>
              </>
            ) : (
              /* ══ VALID TICKET QR ══════════════════════════════════ */
              <>
                {/* Glow ring behind QR */}
                <div className="relative">
                  <motion.div
                    initial={{ scale: 0.7, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.2, type: "spring", stiffness: 280, damping: 22 }}
                    className="relative z-10 bg-white p-4"
                  >
                    <QRCode value={qrValue} size={180} />
                  </motion.div>
                  {/* Pulse glow */}
                  <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: [0.9, 1.12, 0.9], opacity: [0, 0.15, 0] }}
                    transition={{ delay: 0.45, duration: 1.8, repeat: 2, ease: "easeInOut" }}
                    className="absolute inset-0 bg-white blur-xl pointer-events-none"
                  />
                </div>

                {/* Checkmark badge */}
                <motion.div
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.5, type: "spring", stiffness: 500, damping: 22 }}
                  className="mt-4 flex items-center gap-2 border border-emerald-500/30 bg-emerald-500/[0.07] px-3 py-1.5"
                >
                  <svg className="w-3 h-3 text-emerald-400 shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                  <span className="text-[10px] font-mono font-semibold text-emerald-400 tracking-widest uppercase">
                    ZK proof verified · on-chain
                  </span>
                </motion.div>

                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.6 }}
                  className="text-xs text-zinc-600 text-center mt-3"
                >
                  Show this QR code at the venue entrance
                </motion.p>
              </>
            )}
          </div>

          {/* Perforated separator */}
          <div className="relative border-t border-dashed border-white/10 mx-5">
            <div className="absolute -left-8 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-[#0a0a0a] border-r border-white/10" />
            <div className="absolute -right-8 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-[#0a0a0a] border-l border-white/10" />
          </div>

          {/* Ticket footer */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.65 }}
            className="px-6 py-4"
          >
            <p className="text-[9px] font-mono font-semibold text-zinc-700 tracking-widest uppercase mb-1.5">Private nonce</p>
            <p className="text-[10px] font-mono text-zinc-600 break-all leading-relaxed select-all">{savedTicket.secret.nonce}</p>
            <p className="text-[9px] text-zinc-700 mt-2">
              Received {new Date(savedTicket.receivedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
            </p>
          </motion.div>
        </motion.div>

        {/* Floating particles */}
        <div className="relative h-0 overflow-visible pointer-events-none" aria-hidden>
          {[...Array(7)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-1 h-1 rounded-full bg-emerald-400/60"
              style={{ left: `${12 + i * 12}%`, top: "-120px" }}
              initial={{ y: 0, opacity: 0.8, scale: 1 }}
              animate={{ y: -60 - i * 15, opacity: 0, scale: 0.4 }}
              transition={{ delay: 0.4 + i * 0.06, duration: 1.1 + i * 0.1, ease: "easeOut" }}
            />
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.75 }}
          className="pt-5"
        >
          <Link href="/my-tickets"
            className="block text-center text-xs text-zinc-500 hover:text-white transition-colors underline underline-offset-4">
            View all my tickets →
          </Link>
        </motion.div>
      </motion.div>
    );
  }

  const minAge = onChainMinAge;
  const now = new Date();
  const eventEnd = event?.endDate ? new Date(event.endDate) : null;
  const isPast = eventEnd ? eventEnd < now : false;

  return (
    <div className="space-y-5">
      <div className="border border-white/8 bg-white/[0.02] px-5 py-5 space-y-3">
        <h2 className="text-base font-semibold text-white">Get your ticket</h2>
        {isPast ? (
          <div className="flex items-start gap-3 border border-white/6 bg-white/[0.02] px-4 py-3.5">
            <svg className="w-4 h-4 text-zinc-600 mt-0.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
            </svg>
            <div>
              <p className="text-sm font-medium text-zinc-400">This event has ended</p>
              <p className="text-xs text-zinc-600 mt-0.5 leading-relaxed">
                Ticket claims are no longer accepted.
                {eventEnd && ` Ended ${eventEnd.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}.`}
              </p>
            </div>
          </div>
        ) : (
          <>
            <p className="text-sm text-zinc-500 leading-relaxed">
              Claim a ticket with a zero-knowledge age proof.
              {minAge > 0 && ` You must be ${minAge}+ years old.`}
              {" "}Your date of birth stays private — only the proof is submitted on-chain.
            </p>
            <button
              onClick={() => setShowDobModal(true)}
              className="w-full bg-white text-black text-sm font-semibold py-3 hover:bg-zinc-100 transition-colors">
              Claim Ticket
            </button>
          </>
        )}
      </div>

      <ShareHint address={address} />

      {/* DOB modal */}
      {showDobModal && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="w-full max-w-sm border border-white/10 bg-[#0d0d0d] overflow-hidden">
            <div className="px-5 py-4 border-b border-white/8">
              <p className="text-xs font-mono text-zinc-600 uppercase tracking-widest mb-1">ZK Age Proof</p>
              <h3 className="text-sm font-bold text-white">Enter your date of birth</h3>
            </div>
            {claimError ? (
              /* ── Error state — replaces the form ── */
              <div className="px-5 py-7 flex flex-col items-center gap-5">
                {/* Icon ring */}
                <div className="relative flex items-center justify-center">
                  <div className="absolute w-16 h-16 rounded-full bg-red-500/10 animate-ping opacity-30" />
                  <div className="relative w-12 h-12 rounded-full bg-red-500/10 border border-red-500/25 flex items-center justify-center">
                    <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                    </svg>
                  </div>
                </div>

                {/* Headline + message */}
                <div className="text-center space-y-2 px-2">
                  <p className="text-sm font-semibold text-white">
                    {/no midnight wallet/i.test(claimError) || /no.*wallet detected/i.test(claimError) ? "Wallet not found" :
                     /does not support zk proving|getProvingProvider|midnight network/i.test(claimError) ? "Wallet update required" :
                     /proof.*server|proof generation failed|403/i.test(claimError) ? "Proof server unreachable" :
                     /sold.?out/i.test(claimError) ? "Sold out" :
                     /at least \d+ years/i.test(claimError) ? `Must be ${minAge}+` :
                     "Transaction failed"}
                  </p>
                  <p className="text-xs text-zinc-500 leading-relaxed">{claimError}</p>
                </div>

                {/* Proof server unreachable CTA */}
                {/proof.*server|proof generation failed|403/i.test(claimError) && (
                  <div className="w-full space-y-2">
                    <p className="text-[11px] text-zinc-400 text-center leading-relaxed">
                      ZK proofs require a local proof server. Start it with Docker:
                    </p>
                    <code className="block text-[10px] text-zinc-300 bg-white/[0.05] border border-white/10 px-3 py-2 font-mono break-all">
                      docker run -d --rm -p 6300:6300 midnightntwrk/proof-server
                    </code>
                  </div>
                )}

                {/* Wallet-not-found CTA */}
                {(/no midnight wallet/i.test(claimError) || /no.*wallet detected/i.test(claimError)) && (
                  <a
                    href="https://www.lace.io"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] px-4 py-2.5 text-xs font-medium text-zinc-300 hover:text-white transition-colors"
                  >
                    <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                    </svg>
                    Get Lace Wallet ↗
                  </a>
                )}

                {/* Outdated wallet CTA */}
                {/does not support zk proving|getProvingProvider|midnight network/i.test(claimError) && (
                  <div className="w-full space-y-2">
                    <a
                      href="https://www.lace.io"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] px-4 py-2.5 text-xs font-medium text-zinc-300 hover:text-white transition-colors w-full"
                    >
                      <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                      </svg>
                      Update Lace ↗
                    </a>
                    <p className="text-[10px] text-zinc-600 text-center leading-relaxed">
                      In Lace, go to Settings → Network → enable Midnight (Preprod)
                    </p>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 w-full pt-1">
                  <button
                    onClick={() => setClaimError(null)}
                    className="flex-1 bg-white text-black text-sm font-semibold py-3 hover:bg-zinc-100 transition-colors"
                  >
                    Try again
                  </button>
                  <button
                    onClick={() => { setShowDobModal(false); setClaimError(null); }}
                    className="px-5 text-sm text-zinc-500 border border-white/8 hover:text-white hover:border-white/20 transition-colors"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleClaim} className="px-5 py-5 space-y-4">
                <p className="text-xs text-zinc-500 leading-relaxed">
                  Your date of birth is never sent anywhere. A zero-knowledge proof is generated locally in your browser to prove
                  {minAge > 0 ? ` you are ${minAge}+` : " your age"} without revealing the actual date.
                </p>
                <div>
                  <label htmlFor="dobInput" className="block text-xs font-medium text-zinc-400 mb-2">
                    Date of birth
                  </label>
                  <input id="dobInput" type="date"
                    value={dob}
                    onChange={(e) => setDob(e.target.value)}
                    max={new Date().toISOString().split("T")[0]}
                    required disabled={claiming}
                    className="w-full bg-white/[0.03] border border-white/8 px-4 py-3 text-sm text-white focus:outline-none focus:border-white/25 disabled:opacity-40 transition-colors"
                  />
                </div>
                <div className="flex gap-2">
                  <button type="submit" disabled={claiming || !dob}
                    className="flex-1 bg-white text-black text-sm font-semibold py-3 hover:bg-zinc-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                    {claiming ? "Generating ZK proof…" : "Claim Ticket"}
                  </button>
                  <button type="button" onClick={() => { setShowDobModal(false); setClaimError(null); }}
                    disabled={claiming}
                    className="px-5 text-sm text-zinc-500 border border-white/8 hover:text-white hover:border-white/20 disabled:opacity-30 transition-colors">
                    Cancel
                  </button>
                </div>
                {claiming && (
                  <p className="text-xs text-zinc-600 text-center">
                    Generating proof and submitting transaction. This may take 2–4 min.
                  </p>
                )}
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function SecretBox({
  secret,
  label,
}: {
  secret: { contractAddress: string; nonce: string };
  label: string;
}) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(JSON.stringify(secret, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="border border-white/10 bg-white/[0.02] px-4 py-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-medium text-zinc-300">{label}</p>
        <button onClick={copy} className="text-xs text-zinc-500 hover:text-white transition-colors">
          {copied ? "Copied!" : "Copy JSON"}
        </button>
      </div>
      <pre className="text-xs font-mono text-zinc-400 whitespace-pre-wrap break-all">
        {JSON.stringify(secret, null, 2)}
      </pre>
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="border border-red-500/20 bg-red-500/[0.04] px-4 py-4">
      <p className="text-sm font-medium text-red-400 mb-1">Error</p>
      <p className="text-xs text-red-300/70 break-all">{message}</p>
    </div>
  );
}

// ─── Organizer key export ─────────────────────────────────────────────────────

function OrganizerKeyExport({
  contractAddress,
  eventName,
}: {
  contractAddress: string;
  eventName: string;
}) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [downloaded, setDownloaded] = useState(false);

  const secretHex = getCallerSecret(contractAddress) ?? "";

  function downloadKey() {
    if (!secretHex) return;
    const payload = JSON.stringify(
      {
        version: 1,
        purpose: "Midnight Private Event Tickets — organizer key",
        contractAddress,
        eventName,
        callerSecretHex: secretHex,
        exportedAt: new Date().toISOString(),
      },
      null,
      2,
    );
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `organizer-key-${contractAddress.slice(0, 12)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setDownloaded(true);
    setTimeout(() => setDownloaded(false), 3000);
  }

  function copyKey() {
    if (!secretHex) return;
    navigator.clipboard.writeText(secretHex);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="mb-6 rounded-xl border border-amber-500/25 bg-amber-500/5 px-4 py-4">
      <div className="flex items-start gap-3">
        <span className="shrink-0 text-amber-400 text-base mt-px select-none">⚠</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-amber-300 mb-1">
            Back up your organizer key
          </p>
          <p className="text-xs text-amber-200/55 leading-relaxed mb-3">
            This key is stored only in this browser. Clearing browser data, using
            a different device, or a private-browsing session will lock you out
            of managing this event permanently.
          </p>

          {/* Key preview */}
          <div className="rounded-lg border border-white/8 bg-black/25 px-3 py-2.5 mb-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-zinc-500 font-medium">Organizer key</span>
              <button
                onClick={() => setRevealed((v) => !v)}
                className="text-xs text-zinc-500 hover:text-white transition-colors"
              >
                {revealed ? "Hide" : "Reveal"}
              </button>
            </div>
            {revealed ? (
              <p className="text-xs font-mono text-zinc-300 break-all select-all leading-relaxed">
                {secretHex || "—"}
              </p>
            ) : (
              <p className="text-xs font-mono text-zinc-600 break-all select-none leading-relaxed tracking-widest">
                {"•".repeat(Math.min(secretHex.length, 64))}
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={downloadKey}
              disabled={!secretHex}
              className="flex-1 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 disabled:opacity-40 text-black text-xs font-semibold py-2 rounded-lg transition-colors"
            >
              {downloaded ? "Downloaded ✓" : "Export .json"}
            </button>
            <button
              onClick={copyKey}
              disabled={!secretHex}
              className="px-3.5 border border-white/12 text-zinc-400 text-xs hover:text-white hover:border-white/25 disabled:opacity-40 rounded-lg transition-colors"
            >
              {copied ? "Copied!" : "Copy hex"}
            </button>
          </div>

          <p className="text-xs text-amber-200/35 mt-2.5 leading-relaxed">
            Store the exported file somewhere secure — a password manager,
            encrypted notes, or an offline backup.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Organizer key import (other device / browser) ───────────────────────────

function OrganizerKeyImport({
  contractAddress,
  eventName,
  onImported,
}: {
  contractAddress: string;
  eventName: string;
  onImported: () => void;
}) {
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  function tryImport(raw: string) {
    setError(null);
    const trimmed = raw.trim();
    if (!trimmed) return;

    let secretHex: string | null = null;

    // Accept either a raw hex string (0x…) or an exported .json file contents.
    if (trimmed.startsWith("0x") || /^[0-9a-f]{64}$/i.test(trimmed)) {
      secretHex = trimmed.startsWith("0x") ? trimmed : "0x" + trimmed;
    } else {
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed.callerSecretHex && typeof parsed.callerSecretHex === "string") {
          secretHex = parsed.callerSecretHex;
        } else {
          throw new Error("No callerSecretHex field found.");
        }
      } catch {
        setError("Couldn't read the key. Paste the hex string or the full exported .json.");
        return;
      }
    }

    // Basic sanity: must be a hex string of the right length.
    const hex = secretHex!.replace(/^0x/, "");
    if (!/^[0-9a-f]+$/i.test(hex) || hex.length < 8) {
      setError("The key doesn't look valid — check you copied the full value.");
      return;
    }

    saveCallerSecret(contractAddress, secretHex!);
    onImported();
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setInput(text ?? "");
      tryImport(text ?? "");
    };
    reader.readAsText(file);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-blue-500/25 bg-blue-500/5 px-4 py-4">
        <div className="flex items-start gap-3">
          <span className="shrink-0 text-blue-400 text-base mt-px select-none">🔑</span>
          <div>
            <p className="text-sm font-semibold text-blue-300 mb-1">
              Organizer key required
            </p>
            <p className="text-xs text-blue-200/55 leading-relaxed">
              You&apos;re the host of <span className="text-white font-medium">{eventName || contractAddress}</span> but
              the organizer key isn&apos;t saved in this browser. Paste your hex key or
              upload the exported <code className="text-blue-300">.json</code> backup file.
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-white/8 bg-white/[0.02] px-5 py-5 space-y-4">
        <p className="text-sm font-semibold text-white">Import organizer key</p>

        {/* File upload */}
        <label className="flex items-center justify-center gap-2 border border-dashed border-white/15 rounded-lg py-4 cursor-pointer hover:border-white/30 hover:bg-white/[0.02] transition-colors">
          <svg className="w-4 h-4 text-zinc-500" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
          </svg>
          <span className="text-xs text-zinc-400">Upload <code className="text-zinc-300">organizer-key-….json</code></span>
          <input type="file" accept=".json,application/json" className="hidden" onChange={handleFile} />
        </label>

        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-white/8" />
          <span className="text-xs text-zinc-600">or paste</span>
          <div className="flex-1 h-px bg-white/8" />
        </div>

        {/* Manual paste */}
        <textarea
          rows={3}
          placeholder={'Paste hex key (0x…) or full exported JSON'}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="w-full bg-white/[0.03] border border-white/8 px-4 py-3 text-xs text-white font-mono placeholder-zinc-700 focus:outline-none focus:border-white/30 transition-colors resize-none rounded-lg"
        />

        {error && <p className="text-xs text-red-400">{error}</p>}

        <button
          onClick={() => tryImport(input)}
          disabled={!input.trim()}
          className="w-full bg-white text-black text-sm font-semibold py-2.5 rounded-xl hover:bg-zinc-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          Restore access
        </button>
      </div>
    </div>
  );
}

function ShareHint({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  const url =
    typeof window !== "undefined"
      ? `${window.location.origin}/events/${encodeURIComponent(address)}`
      : "";

  function copy() {
    if (url) {
      navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div className="mt-6 rounded-xl border border-white/6 bg-white/2 px-4 py-3 flex items-center justify-between gap-3">
      <p className="text-xs text-zinc-600 truncate">
        Share event URL with attendees
      </p>
      <button
        onClick={copy}
        className="shrink-0 text-xs text-zinc-500 hover:text-white transition-colors"
      >
        {copied ? "Copied!" : "Copy link"}
      </button>
    </div>
  );
}
