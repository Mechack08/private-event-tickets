"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import QRCode from "react-qr-code";
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
  type StoredEvent,
} from "@/lib/storage";
import { api as backendApi } from "@/lib/api";

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
          {/* Map */}
          <div style={{ height: 240 }}>
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

function OrganizerView({
  address,
  event,
}: {
  address: string;
  event: StoredEvent;
}) {
  const { wallet, connect } = useWallet();
  const [tab, setTab] = useState<"admit" | "info">("admit");
  const [nonceInput, setNonceInput] = useState("");
  const [admitting, setAdmitting] = useState(false);
  const [admitResult, setAdmitResult] = useState<"success" | "error" | null>(null);
  const [admitError, setAdmitError] = useState<string | null>(null);
  const [eventStatus, setEventStatus] = useState<EventStatus>("active");
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

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
      if (action === "pause")   await contractApi.pauseEvent();
      if (action === "resume")  await contractApi.resumeEvent();
      if (action === "cancel")  await contractApi.cancelEvent();
      setEventStatus(
        action === "pause"  ? "paused" :
        action === "cancel" ? "cancelled" :
        "active",
      );
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : String(err));
    } finally {
      setStatusLoading(false);
    }
  }

  async function handleAdmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = nonceInput.trim();
    if (!trimmed) return;
    setAdmitting(true);
    setAdmitResult(null);
    setAdmitError(null);
    try {
      const contractApi = await buildApi();
      const { hexToBigint } = await import("@sdk/contract-api");
      const nonce = hexToBigint(trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`);
      await contractApi.admitTicket(nonce);
      setAdmitResult("success");
      setNonceInput("");
    } catch (err) {
      setAdmitResult("error");
      setAdmitError(err instanceof Error ? err.message : String(err));
    } finally {
      setAdmitting(false);
    }
  }

  const isCancelled = eventStatus === "cancelled";

  return (
    <div>
      {/* Status controls */}
      <div className="flex items-center gap-2 mb-6">
        <span className={`text-xs border px-2.5 py-1 rounded-full ${
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
                className="text-xs text-zinc-400 hover:text-yellow-400 border border-white/8 hover:border-yellow-500/30 px-2.5 py-1 rounded-full transition-colors disabled:opacity-30">
                {statusLoading ? "…" : "Pause"}
              </button>
            ) : (
              <button onClick={() => changeStatus("resume")} disabled={statusLoading}
                className="text-xs text-zinc-400 hover:text-emerald-400 border border-white/8 hover:border-emerald-500/30 px-2.5 py-1 rounded-full transition-colors disabled:opacity-30">
                {statusLoading ? "…" : "Resume"}
              </button>
            )}
            <button
              onClick={() => { if (confirm("Cancel this event permanently? This cannot be undone.")) changeStatus("cancel"); }}
              disabled={statusLoading}
              className="text-xs text-zinc-600 hover:text-red-400 border border-white/8 hover:border-red-500/30 px-2.5 py-1 rounded-full transition-colors disabled:opacity-30">
              Cancel event
            </button>
          </>
        )}
      </div>

      {statusError && <ErrorBox message={statusError} />}

      {/* Organizer key backup */}
      <OrganizerKeyExport contractAddress={address} eventName={event.eventName} />

      {/* Tabs */}
      <div className="flex gap-1 border-b border-white/8 mb-6">
        {(["admit", "info"] as const).map((id) => (
          <button key={id} onClick={() => setTab(id)}
            className={`px-3 py-2 text-sm -mb-px border-b-2 transition-colors capitalize ${
              tab === id ? "border-white text-white font-medium" : "border-transparent text-zinc-500 hover:text-white"
            }`}>
            {id === "admit" ? "Admit Attendees" : "Event Info"}
          </button>
        ))}
      </div>

      {/* Tab: Admit */}
      {tab === "admit" && (
        <div className="space-y-5">
          <p className="text-sm text-zinc-400 leading-relaxed">
            Scan an attendee&apos;s QR code or paste their ticket nonce to admit them. This marks the ticket as used on-chain, preventing double admission.
          </p>

          <form onSubmit={handleAdmit} className="space-y-3">
            <div>
              <label htmlFor="nonceInput" className="block text-xs font-medium text-zinc-400 mb-2">
                Ticket nonce (hex)
              </label>
              <input
                id="nonceInput"
                type="text"
                placeholder="0x…"
                value={nonceInput}
                onChange={(e) => { setNonceInput(e.target.value); setAdmitResult(null); }}
                disabled={admitting || isCancelled}
                className="w-full bg-white/[0.03] border border-white/8 px-4 py-3 text-sm text-white font-mono placeholder-zinc-700 focus:outline-none focus:border-white/25 disabled:opacity-40 transition-colors"
              />
            </div>
            <button type="submit" disabled={admitting || !nonceInput.trim() || isCancelled}
              className="w-full bg-white text-black text-sm font-semibold py-3 hover:bg-zinc-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
              {admitting ? "Submitting ZK proof…" : isCancelled ? "Event is cancelled" : "Admit Attendee"}
            </button>
          </form>

          {admitResult === "success" && (
            <div className="border border-emerald-500/20 bg-emerald-500/[0.04] px-4 py-4">
              <p className="text-sm font-semibold text-emerald-400">✓ Admitted</p>
              <p className="text-xs text-zinc-400 mt-1">Ticket marked as used on-chain. Attendee admitted successfully.</p>
            </div>
          )}
          {admitResult === "error" && admitError && <ErrorBox message={admitError} />}
        </div>
      )}

      {/* Tab: Info */}
      {tab === "info" && (
        <div className="space-y-4">
          <div className="border border-white/8 divide-y divide-white/6">
            <div className="flex items-center justify-between px-4 py-3">
              <p className="text-xs text-zinc-500">Total capacity</p>
              <p className="text-sm font-mono text-white">{event.totalTickets}</p>
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <p className="text-xs text-zinc-500">Min age</p>
              <p className="text-sm font-mono text-white">
                {(event.minAge ?? 0) > 0 ? `${event.minAge}+` : "No restriction"}
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

  async function handleClaim(e: React.FormEvent) {
    e.preventDefault();
    if (!dob) return;
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
      const { nonce } = await contractApi.claimTicket(birthYear);
      const secret = contractApi.ticketSecret(nonce);
      const ticket = {
        id: crypto.randomUUID(),
        contractAddress: address,
        eventName: event?.eventName ?? address,
        secret,
        receivedAt: new Date().toISOString(),
      };
      saveTicket(ticket);
      setSavedTicket(ticket);
      setShowDobModal(false);
    } catch (err) {
      setClaimError(err instanceof Error ? err.message : String(err));
    } finally {
      setClaiming(false);
    }
  }

  if (savedTicket) {
    const qrValue = JSON.stringify(savedTicket.secret);
    return (
      <div className="space-y-5">
        <div>
          <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest mb-1">Your ticket</p>
          <h2 className="text-base font-bold text-white">{savedTicket.eventName}</h2>
        </div>
        {/* QR code */}
        <div className="flex flex-col items-center gap-4 border border-white/8 bg-white p-6">
          <QRCode value={qrValue} size={200} />
          <p className="text-xs text-zinc-800 text-center">
            Show this QR code at the venue entrance
          </p>
        </div>
        <div className="border border-white/6 bg-white/[0.02] px-4 py-3">
          <p className="text-xs text-zinc-600 break-all font-mono">{savedTicket.secret.nonce}</p>
        </div>
        <Link href="/my-tickets"
          className="block text-center text-xs text-zinc-500 hover:text-white transition-colors underline underline-offset-4">
          View all my tickets →
        </Link>
      </div>
    );
  }

  const minAge = event?.minAge ?? 0;

  return (
    <div className="space-y-5">
      <div className="border border-white/8 bg-white/[0.02] px-5 py-5 space-y-3">
        <h2 className="text-base font-semibold text-white">Get your ticket</h2>
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
      </div>

      <ShareHint address={address} />

      {/* DOB modal */}
      {showDobModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="w-full max-w-sm border border-white/10 bg-[#0d0d0d] overflow-hidden">
            <div className="px-5 py-4 border-b border-white/8">
              <p className="text-xs font-mono text-zinc-600 uppercase tracking-widest mb-1">ZK Age Proof</p>
              <h3 className="text-sm font-bold text-white">Enter your date of birth</h3>
            </div>
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
                  onChange={(e) => { setDob(e.target.value); setClaimError(null); }}
                  max={new Date().toISOString().split("T")[0]}
                  required disabled={claiming}
                  className="w-full bg-white/[0.03] border border-white/8 px-4 py-3 text-sm text-white focus:outline-none focus:border-white/25 disabled:opacity-40 transition-colors"
                />
              </div>
              {claimError && <ErrorBox message={claimError} />}
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
