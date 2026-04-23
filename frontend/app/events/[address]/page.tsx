"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Nav } from "@/components/Nav";
import { WalletConnect } from "@/components/WalletConnect";
import { useWallet } from "@/contexts/WalletContext";
import {
  getEvent,
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

// ─── Main page ────────────────────────────────────────────────────────────────

export default function EventDetailPage() {
  const params = useParams();
  const address = decodeURIComponent(params.address as string);

  const [event, setEvent] = useState<StoredEvent | null>(null);
  const [isOrganizer, setIsOrganizer] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = getEvent(address);
    if (stored) {
      setEvent(stored);
      setIsOrganizer(true);
    }
    setHydrated(true);
  }, [address]);

  if (!hydrated) return null;

  return (
    <>
      <Nav />
      <main className="min-h-dvh bg-[#0a0a0a] pt-14">
        <div className="mx-auto max-w-2xl px-5 pt-12 pb-24">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-xs text-zinc-600 mb-8">
            <Link href="/events" className="hover:text-white transition-colors">
              Events
            </Link>
            <span>/</span>
            <span className="text-zinc-400 truncate max-w-[180px] font-mono">
              {address}
            </span>
          </div>

          {/* Event header */}
          <div className="mb-8">
            <div className="flex items-start justify-between gap-4 mb-2">
              <h1 className="text-2xl font-bold text-white tracking-tight">
                {event?.eventName ?? "Event"}
              </h1>
              {isOrganizer && (
                <span className="shrink-0 text-xs border border-white/15 text-zinc-400 px-2 py-0.5 rounded-full mt-1">
                  Organizer
                </span>
              )}
            </div>
            <p className="text-xs font-mono text-zinc-600 break-all">{address}</p>
            {event && (
              <p className="text-xs text-zinc-500 mt-2">
                {event.totalTickets} tickets total ·{" "}
                {new Date(event.createdAt).toLocaleDateString()}
              </p>
            )}
          </div>

          {isOrganizer ? (
            <OrganizerView address={address} event={event!} />
          ) : (
            <AttendeeView address={address} eventName={event?.eventName} />
          )}
        </div>
      </main>
    </>
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
  const { status, wallet } = useWallet();
  const [tab, setTab] = useState<OrganizerTab>("requests");
  const [requests, setRequests] = useState<TicketRequest[]>([]);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [directSecret, setDirectSecret] = useState<{
    contractAddress: string;
    nonce: string;
  } | null>(null);
  const [issuing, setIssuing] = useState(false);
  const [issueError, setIssueError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setRequests(getEventRequests(address));
  }, [address]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const pendingCount = requests.filter((r) => r.status === "pending").length;
  const approvedCount = requests.filter((r) => r.status === "approved").length;

  async function buildApi() {
    if (status !== "connected" || !wallet) {
      throw new Error("Wallet not connected");
    }
    const [{ createEventTicketProviders }, { EventTicketAPI }, { PREPROD_CONFIG }] =
      await Promise.all([
        import("@sdk/providers"),
        import("@sdk/contract-api"),
        import("@sdk/types"),
      ]);
    const providers = await createEventTicketProviders(wallet, PREPROD_CONFIG);
    return EventTicketAPI.join(providers, address);
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

  return (
    <div>
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
      {status !== "connected" && <WalletConnect />}

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
                walletReady={status === "connected"}
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
            disabled={issuing || status !== "connected"}
            className="w-full bg-white text-black text-sm font-medium py-3 rounded-xl hover:bg-zinc-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            {issuing ? "Generating ZK proof…" : "Issue Ticket"}
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
  walletReady,
}: {
  req: TicketRequest;
  processingId: string | null;
  onApprove: (r: TicketRequest) => void;
  onReject: (r: TicketRequest) => void;
  walletReady: boolean;
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
            disabled={busy || !walletReady}
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
