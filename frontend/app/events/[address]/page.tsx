"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Nav } from "@/components/Nav";
import { EventPlaceholder } from "@/components/EventPlaceholder";
import { useWallet } from "@/contexts/WalletContext";
import { useAuth } from "@/contexts/AuthContext";
import {
  getEvent,
  getCallerSecret,
  saveCallerSecret,
  getEventRequests,
  addRequest,
  updateRequest,
  getMyRequestId,
  setMyRequestId,
  saveTicket,
  type StoredEvent,
  type TicketRequest,
} from "@/lib/storage";
import { api as backendApi } from "@/lib/api";

type OrganizerTab = "requests" | "attendees" | "issue";
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
        if (user && backendEvent.hostId === user.userId) {
          // Authenticated user is the host — check if their ZK key is already here.
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
          setIsOrganizer(true);
          setHasLocalKey(!!getCallerSecret(address));
        }
        // else: event found but user is not the host — attendee view (no error)
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
            <AttendeeView address={address} eventName={event?.eventName} />
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
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  }

  function fmtBig(d: Date) {
    return {
      day:   d.toLocaleDateString("en-GB", { day: "2-digit" }),
      month: d.toLocaleDateString("en-GB", { month: "short" }).toUpperCase(),
      year:  d.getFullYear(),
      dow:   d.toLocaleDateString("en-GB", { weekday: "short" }).toUpperCase(),
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
    { label: "OPENS",  date: start },
    { label: "CLOSES", date: end   },
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

      {/* Ticket-stub stats: OPENS | CLOSES | CAPACITY */}
      {event && (
        <div className="grid grid-cols-3 border border-white/8 divide-x divide-white/8 mb-5">
          {statRows.map(({ label, date }) => {
            const d = date ? fmtBig(date) : null;
            return (
              <div key={label} className="px-4 py-4">
                <p className="text-[9px] font-mono font-semibold text-zinc-700 tracking-widest mb-2">{label}</p>
                {d ? (
                  <>
                    <p className="text-2xl font-black text-white tabular-nums leading-none">{d.day}</p>
                    <p className="text-xs font-mono text-zinc-400 mt-1">{d.month} {d.year}</p>
                    <p className="text-[10px] font-mono text-zinc-700 mt-0.5">{d.dow}</p>
                  </>
                ) : (
                  <p className="text-zinc-700 text-sm">—</p>
                )}
              </div>
            );
          })}
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
  const [tab, setTab] = useState<OrganizerTab>("requests");
  const [requests, setRequests] = useState<TicketRequest[]>([]);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [directSecret, setDirectSecret] = useState<{
    contractAddress: string;
    nonce: string;
  } | null>(null);
  const [issuing, setIssuing] = useState(false);
  const [issueError, setIssueError] = useState<string | null>(null);
  const [eventStatus, setEventStatus] = useState<EventStatus>("active");
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setRequests(getEventRequests(address));
  }, [address]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const pendingCount = requests.filter((r) => r.status === "pending").length;
  const approvedCount = requests.filter((r) => r.status === "approved").length;

  async function buildApi() {
    // Connect wallet on-demand — triggers the wallet picker popup if needed.
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

  async function approveRequest(req: TicketRequest) {
    setProcessingId(req.id);
    setIssueError(null);
    try {
      const contractApi = await buildApi();
      const { nonce } = await contractApi.issueTicket();
      const { bigintToHex } = await import("@sdk/contract-api");
      const secret = contractApi.ticketSecret(nonce);
      updateRequest(address, req.id, {
        status: "approved",
        secret,
        processedAt: new Date().toISOString(),
      });

      // Sync to backend (non-fatal)
      try {
        const event = await backendApi.events.byAddress(address);
        await backendApi.tickets.issue({ commitment: bigintToHex(nonce), eventId: event.id });
      } catch {
        console.warn("Backend ticket sync failed — continuing.");
      }

      refresh();
    } catch (err) {
      setIssueError(err instanceof Error ? err.message : String(err));
    } finally {
      setProcessingId(null);
    }
  }

  async function rejectRequest(req: TicketRequest) {
    setProcessingId(req.id);
    updateRequest(address, req.id, {
      status: "rejected",
      processedAt: new Date().toISOString(),
    });
    refresh();
    setProcessingId(null);
  }

  async function issueDirectly() {
    setIssuing(true);
    setIssueError(null);
    setDirectSecret(null);
    try {
      const contractApi = await buildApi();
      const { nonce } = await contractApi.issueTicket();
      const { bigintToHex } = await import("@sdk/contract-api");
      setDirectSecret(contractApi.ticketSecret(nonce));

      // Sync to backend (non-fatal)
      try {
        const event = await backendApi.events.byAddress(address);
        await backendApi.tickets.issue({ commitment: bigintToHex(nonce), eventId: event.id });
      } catch {
        console.warn("Backend ticket sync failed — continuing.");
      }
    } catch (err) {
      setIssueError(err instanceof Error ? err.message : String(err));
    } finally {
      setIssuing(false);
    }
  }

  const canIssue = eventStatus === "active";
  const isCancelled = eventStatus === "cancelled";

  return (
    <div>
      {/* Event status controls */}
      <div className="flex items-center gap-2 mb-6">
        <span
          className={`text-xs border px-2.5 py-1 rounded-full ${
            isCancelled
              ? "border-red-500/30 text-red-400"
              : eventStatus === "paused"
              ? "border-yellow-500/30 text-yellow-400"
              : "border-emerald-500/30 text-emerald-400"
          }`}
        >
          {isCancelled ? "Cancelled" : eventStatus === "paused" ? "Paused" : "Active"}
        </span>

        {!isCancelled && (
          <>
            {eventStatus === "active" ? (
              <button
                onClick={() => changeStatus("pause")}
                disabled={statusLoading}
                className="text-xs text-zinc-400 hover:text-yellow-400 border border-white/8 hover:border-yellow-500/30 px-2.5 py-1 rounded-full transition-colors disabled:opacity-30"
              >
                {statusLoading ? "…" : "Pause"}
              </button>
            ) : (
              <button
                onClick={() => changeStatus("resume")}
                disabled={statusLoading}
                className="text-xs text-zinc-400 hover:text-emerald-400 border border-white/8 hover:border-emerald-500/30 px-2.5 py-1 rounded-full transition-colors disabled:opacity-30"
              >
                {statusLoading ? "…" : "Resume"}
              </button>
            )}
            <button
              onClick={() => {
                if (confirm("Cancel this event permanently? This cannot be undone.")) {
                  changeStatus("cancel");
                }
              }}
              disabled={statusLoading}
              className="text-xs text-zinc-600 hover:text-red-400 border border-white/8 hover:border-red-500/30 px-2.5 py-1 rounded-full transition-colors disabled:opacity-30"
            >
              Cancel event
            </button>
          </>
        )}
      </div>

      {statusError && <ErrorBox message={statusError} />}

      {/* Organizer key backup */}
      <OrganizerKeyExport contractAddress={address} eventName={event.eventName} />

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: "Total", value: event.totalTickets },
          { label: "Approved", value: approvedCount },
          { label: "Pending", value: pendingCount },
        ].map(({ label, value }) => (
          <div
            key={label}
            className="rounded-xl border border-white/8 bg-white/3 px-4 py-3 text-center"
          >
            <p className="text-xl font-bold text-white tabular-nums">{value}</p>
            <p className="text-xs text-zinc-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Wallet required for actions */}
      {isCancelled && (
        <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3">
          <p className="text-xs text-red-400">This event has been permanently cancelled. No further tickets can be issued.</p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-white/8 mb-6">
        {(
          [
            ["requests", `Requests${pendingCount > 0 ? ` (${pendingCount})` : ""}`],
            ["attendees", "Attendees"],
            ["issue", "Issue Direct"],
          ] as [OrganizerTab, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-3 py-2 text-sm -mb-px border-b-2 transition-colors ${
              tab === id
                ? "border-white text-white font-medium"
                : "border-transparent text-zinc-500 hover:text-white"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab: Requests */}
      {tab === "requests" && (
        <div className="space-y-3">
          {requests.length === 0 ? (
            <p className="text-sm text-zinc-600 py-8 text-center">
              No ticket requests yet. Share the event URL with attendees.
            </p>
          ) : (
            requests.map((req) => (
              <RequestCard
                key={req.id}
                req={req}
                processingId={processingId}
                onApprove={approveRequest}
                onReject={rejectRequest}
              />
            ))
          )}

          {/* Share URL hint */}
          <ShareHint address={address} />
        </div>
      )}

      {/* Tab: Attendees */}
      {tab === "attendees" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-white/8 bg-white/3 px-5 py-5">
            <p className="text-sm font-medium text-white mb-1">
              {approvedCount} ticket{approvedCount !== 1 ? "s" : ""} issued
            </p>
            <p className="text-xs text-zinc-500 leading-relaxed">
              Each attendee is identified only by a Poseidon hash commitment on
              the ledger. No names, emails, or identities are stored.
            </p>
          </div>
          {requests
            .filter((r) => r.status === "approved")
            .map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between gap-4 rounded-xl border border-white/8 px-4 py-3"
              >
                <div>
                  <p className="text-sm text-white">{r.requesterName}</p>
                  <p className="text-xs text-zinc-600">
                    Approved {r.processedAt ? new Date(r.processedAt).toLocaleDateString() : ""}
                  </p>
                </div>
                <span className="text-xs text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                  Issued
                </span>
              </div>
            ))}
        </div>
      )}

      {/* Tab: Issue Directly */}
      {tab === "issue" && (
        <div className="space-y-4">
          <p className="text-sm text-zinc-400">
            Issue a ticket without a request — useful for VIPs or offline
            registration. Share the resulting secret with the attendee via a
            private channel.
          </p>

          <button
            onClick={issueDirectly}
            disabled={issuing || !canIssue}
            className="w-full bg-white text-black text-sm font-medium py-3 rounded-xl hover:bg-zinc-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            {issuing ? "Generating ZK proof…" : isCancelled ? "Event is cancelled" : eventStatus === "paused" ? "Event is paused" : "Issue Ticket"}
          </button>

          {issuing && (
            <div className="rounded-xl border border-white/8 bg-white/3 px-4 py-3">
              <p className="text-xs text-zinc-400">
                Generating proof and submitting transaction. This takes 2–4 min.
              </p>
            </div>
          )}

          {directSecret && (
            <SecretBox
              secret={directSecret}
              label="Ticket secret — share privately with the attendee"
            />
          )}

          {issueError && <ErrorBox message={issueError} />}
        </div>
      )}

      {issueError && tab === "requests" && <ErrorBox message={issueError} />}
    </div>
  );
}

// ─── Attendee view ────────────────────────────────────────────────────────────

function AttendeeView({
  address,
  eventName,
}: {
  address: string;
  eventName?: string;
}) {
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [myReq, setMyReq] = useState<TicketRequest | null>(null);
  const [savedTicket, setSavedTicket] = useState(false);

  // Check if we already have a request for this event on this browser.
  useEffect(() => {
    const id = getMyRequestId(address);
    if (id) {
      const req = getEventRequests(address).find((r) => r.id === id);
      if (req) setMyReq(req);
    }
  }, [address]);

  function submitRequest(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const id = crypto.randomUUID();
    const req: TicketRequest = {
      id,
      contractAddress: address,
      eventName: eventName ?? address,
      requesterName: name.trim(),
      note: note.trim(),
      status: "pending",
      requestedAt: new Date().toISOString(),
    };
    addRequest(req);
    setMyRequestId(address, id);
    setMyReq(req);
    setSubmitting(false);
  }

  function claimTicket(secret: { contractAddress: string; nonce: string }) {
    saveTicket({
      id: myReq!.id,
      contractAddress: address,
      eventName: eventName ?? address,
      secret,
      receivedAt: new Date().toISOString(),
    });
    setSavedTicket(true);
  }

  // Refresh request status from storage
  function refreshStatus() {
    if (!myReq) return;
    const req = getEventRequests(address).find((r) => r.id === myReq.id);
    if (req) setMyReq(req);
  }

  if (myReq) {
    return (
      <div>
        <div className="mb-6 rounded-xl border border-white/8 bg-white/3 px-5 py-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-white">Your request</p>
            <StatusPill status={myReq.status} />
          </div>
          <p className="text-xs text-zinc-400">
            Requested by <span className="text-white">{myReq.requesterName}</span>
          </p>
          {myReq.note && (
            <p className="text-xs text-zinc-500 mt-1 italic">&ldquo;{myReq.note}&rdquo;</p>
          )}
          <p className="text-xs text-zinc-600 mt-2">
            {new Date(myReq.requestedAt).toLocaleString()}
          </p>
          {myReq.status === "pending" && (
            <button
              onClick={refreshStatus}
              className="mt-4 text-xs text-zinc-500 hover:text-white transition-colors underline underline-offset-4"
            >
              Refresh status
            </button>
          )}
        </div>

        {myReq.status === "approved" && myReq.secret && !savedTicket && (
          <div className="space-y-4">
            <SecretBox
              secret={myReq.secret}
              label="Your ticket secret — save it, this is your proof of ownership"
            />
            <button
              onClick={() => claimTicket(myReq.secret!)}
              className="w-full bg-white text-black text-sm font-medium py-3 rounded-xl hover:bg-zinc-100 transition-colors"
            >
              Save to My Tickets
            </button>
          </div>
        )}

        {savedTicket && (
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/6 px-4 py-4">
            <p className="text-sm font-medium text-emerald-400 mb-1">
              Ticket saved
            </p>
            <p className="text-xs text-zinc-400">
              Find it in{" "}
              <Link
                href="/my-tickets"
                className="underline underline-offset-4 hover:text-white"
              >
                My Tickets
              </Link>
              . Use Verify to prove ownership.
            </p>
          </div>
        )}

        {myReq.status === "rejected" && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/6 px-4 py-4">
            <p className="text-sm text-red-400">
              Your ticket request was not accepted.
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-base font-semibold text-white mb-1">
          Request a Ticket
        </h2>
        <p className="text-sm text-zinc-500">
          The organizer will review your request and issue a private ticket
          secret if approved.
        </p>
      </div>

      <form onSubmit={submitRequest} className="space-y-4">
        <div>
          <label
            htmlFor="reqName"
            className="block text-xs font-medium text-zinc-400 mb-2"
          >
            Your name
          </label>
          <input
            id="reqName"
            type="text"
            placeholder="Alice"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={80}
            className="w-full bg-white/4 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-white/30 transition-colors"
          />
        </div>

        <div>
          <label
            htmlFor="reqNote"
            className="block text-xs font-medium text-zinc-400 mb-2"
          >
            Note{" "}
            <span className="text-zinc-600 font-normal">(optional)</span>
          </label>
          <textarea
            id="reqNote"
            rows={3}
            placeholder="Any message for the organizer…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={280}
            className="w-full bg-white/4 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-white/30 transition-colors resize-none"
          />
        </div>

        <button
          type="submit"
          disabled={submitting || !name.trim()}
          className="w-full bg-white text-black text-sm font-medium py-3 rounded-xl hover:bg-zinc-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          {submitting ? "Submitting…" : "Request Ticket"}
        </button>
      </form>

      <ShareHint address={address} />
    </div>
  );
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function RequestCard({
  req,
  processingId,
  onApprove,
  onReject,
}: {
  req: TicketRequest;
  processingId: string | null;
  onApprove: (r: TicketRequest) => void;
  onReject: (r: TicketRequest) => void;
}) {
  const [copiedSecret, setCopiedSecret] = useState(false);
  const busy = processingId === req.id;

  function copySecret() {
    if (!req.secret) return;
    navigator.clipboard.writeText(JSON.stringify(req.secret, null, 2));
    setCopiedSecret(true);
    setTimeout(() => setCopiedSecret(false), 2000);
  }

  return (
    <div className="rounded-xl border border-white/8 bg-white/3 px-5 py-4">
      <div className="flex items-start justify-between gap-4 mb-2">
        <div>
          <p className="text-sm font-medium text-white">{req.requesterName}</p>
          {req.note && (
            <p className="text-xs text-zinc-500 mt-0.5 italic">
              &ldquo;{req.note}&rdquo;
            </p>
          )}
          <p className="text-xs text-zinc-600 mt-1">
            {new Date(req.requestedAt).toLocaleString()}
          </p>
        </div>
        <StatusPill status={req.status} />
      </div>

      {req.status === "pending" && (
        <div className="flex gap-2 mt-3">
          <button
            onClick={() => onApprove(req)}
            disabled={busy}
            className="flex-1 bg-white text-black text-xs font-medium py-2 rounded-lg hover:bg-zinc-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            {busy ? "Issuing…" : "Approve"}
          </button>
          <button
            onClick={() => onReject(req)}
            disabled={busy}
            className="flex-1 border border-white/10 text-zinc-400 text-xs py-2 rounded-lg hover:border-white/25 hover:text-white disabled:opacity-30 transition-colors"
          >
            Reject
          </button>
        </div>
      )}

      {req.status === "approved" && req.secret && (
        <div className="mt-3 rounded-lg border border-white/6 bg-white/3 px-3 py-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-zinc-400">Ticket secret</p>
            <button
              onClick={copySecret}
              className="text-xs text-zinc-600 hover:text-white transition-colors"
            >
              {copiedSecret ? "Copied!" : "Copy"}
            </button>
          </div>
          <pre className="text-xs font-mono text-zinc-500 whitespace-pre-wrap break-all">
            {JSON.stringify(req.secret, null, 2)}
          </pre>
          <p className="text-xs text-zinc-600 mt-2">
            Send this to {req.requesterName} privately.
          </p>
        </div>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: TicketRequest["status"] }) {
  const styles = {
    pending: "border-yellow-500/20 text-yellow-400",
    approved: "border-emerald-500/20 text-emerald-400",
    rejected: "border-red-500/20 text-red-400",
  };
  return (
    <span
      className={`shrink-0 text-xs border px-2 py-0.5 rounded-full ${styles[status]}`}
    >
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

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
    <div className="rounded-xl border border-white/10 bg-white/4 px-4 py-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-medium text-zinc-300">{label}</p>
        <button
          onClick={copy}
          className="text-xs text-zinc-500 hover:text-white transition-colors"
        >
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
    <div className="rounded-xl border border-red-500/20 bg-red-500/6 px-4 py-4">
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
