"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import QRCode from "react-qr-code";
import { motion } from "framer-motion";
import { Nav } from "@/components/Nav";
import { useWallet } from "@/contexts/WalletContext";
import { api } from "@/lib/api";
import {
  getMyTickets,
  saveTicket,
  removeTicket,
  markTicketUsed,
  type SavedTicket,
} from "@/lib/storage";

export default function MyTicketsPage() {
  const [tickets, setTickets] = useState<SavedTicket[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // Import ticket state
  const [importJson, setImportJson] = useState("");
  const [importEventName, setImportEventName] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);

  useEffect(() => {
    setTickets(getMyTickets());
    setHydrated(true);
  }, []);

  // ── Silent admission sync ──────────────────────────────────────────────
  // Fetch the attendee's backend tickets and mark any admitted ones as used
  // in localStorage. No wallet required — just the session cookie.
  useEffect(() => {
    if (!hydrated) return;
    api.tickets.mine().then((backendTickets) => {
      let changed = false;
      for (const bt of backendTickets) {
        if (!bt.isVerified) continue;
        // Find the matching local ticket by claimTxId
        const local = getMyTickets().find((t) => t.claimTxId === bt.claimTxId);
        if (local && !local.isUsed) {
          markTicketUsed(local.id, bt.verifiedAt ?? undefined);
          changed = true;
        }
      }
      if (changed) setTickets(getMyTickets());
    }).catch(() => {/* not logged in or backend down — silently skip */});
  }, [hydrated]);

  function refresh() {
    setTickets(getMyTickets());
  }

  function handleImport(e: React.FormEvent) {
    e.preventDefault();
    setImportError(null);
    try {
      const parsed = JSON.parse(importJson);
      if (
        typeof parsed.contractAddress !== "string" ||
        typeof parsed.nonce !== "string"
      ) {
        throw new Error("Must have contractAddress and nonce fields.");
      }
      saveTicket({
        id: crypto.randomUUID(),
        contractAddress: parsed.contractAddress,
        eventName: importEventName.trim() || parsed.contractAddress,
        secret: { contractAddress: parsed.contractAddress, nonce: parsed.nonce },
        receivedAt: new Date().toISOString(),
      });
      setImportJson("");
      setImportEventName("");
      setShowImport(false);
      refresh();
    } catch (err) {
      setImportError(
        err instanceof Error ? err.message : "Invalid JSON format.",
      );
    }
  }

  function handleRemove(id: string) {
    removeTicket(id);
    refresh();
  }

  if (!hydrated) return null;

  return (
    <>
      <Nav />
      <main className="min-h-dvh bg-[#080808] pt-14">
        <div className="mx-auto max-w-2xl px-5 pt-12 pb-24">
          <div className="flex items-start justify-between mb-8 gap-4">
            <div>
              <p className="text-[11px] text-zinc-500 uppercase tracking-widest font-medium mb-1.5">Attendee</p>
              <h1 className="text-2xl font-bold text-white tracking-tight">My Tickets</h1>
              <p className="text-sm text-zinc-500 mt-1">Your saved ticket secrets. Keep them private.</p>
            </div>
            <button
              onClick={() => setShowImport((v) => !v)}
              className="shrink-0 text-xs font-semibold bg-white text-black px-3 py-2 hover:bg-zinc-100 transition-colors"
            >
              {showImport ? "Cancel" : "Import"}
            </button>
          </div>

          {/* Import form */}
          {showImport && (
            <form
              onSubmit={handleImport}
              className="mb-8 border border-white/8 bg-white/[0.02] px-5 py-5 space-y-4"
            >
              <p className="text-sm font-semibold text-white">Import ticket secret</p>
              <div>
                <label
                  htmlFor="importName"
                  className="block text-xs font-medium text-zinc-400 mb-2"
                >
                  Event name{" "}
                  <span className="text-zinc-600 font-normal">(optional)</span>
                </label>
                <input
                  id="importName"
                  type="text"
                  placeholder="e.g. DevCon 2026"
                  value={importEventName}
                  onChange={(e) => setImportEventName(e.target.value)}
                  className="w-full bg-white/[0.03] border border-white/8 px-4 py-3 text-sm text-white placeholder-zinc-700 focus:outline-none focus:border-white/30 transition-colors"
                />
              </div>
              <div>
                <label
                  htmlFor="importJson"
                  className="block text-xs font-medium text-zinc-400 mb-2"
                >
                  Ticket secret JSON
                </label>
                <textarea
                  id="importJson"
                  rows={4}
                  placeholder={'{\n  "contractAddress": "0x…",\n  "nonce": "0x…"\n}'}
                  value={importJson}
                  onChange={(e) => setImportJson(e.target.value)}
                  required
                  className="w-full bg-white/[0.03] border border-white/8 px-4 py-3 text-xs text-white font-mono placeholder-zinc-700 focus:outline-none focus:border-white/30 transition-colors resize-none"
                />
              </div>
              {importError && (
                <p className="text-xs text-red-400">{importError}</p>
              )}
              <button
                type="submit"
                className="w-full bg-white text-black text-sm font-semibold py-3 hover:bg-zinc-100 transition-colors"
              >
                Save Ticket
              </button>
            </form>
          )}

          {/* Tickets list */}
          {tickets.length === 0 ? (
            <div className="text-center py-20 border border-white/6 bg-white/[0.02]">
              <p className="text-xs text-zinc-600 text-center">
              No tickets saved yet.
            </p>
            <p className="text-zinc-700 text-xs mt-2">
              Claim a ticket on an event page, or import a secret above.
            </p>
            </div>
          ) : (
            <div className="space-y-2">
              {tickets.map((ticket) => (
                <TicketCard
                  key={ticket.id}
                  ticket={ticket}
                  onRemove={handleRemove}
                  onRefresh={refresh}
                />
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  );
}

// ─── Ticket card ──────────────────────────────────────────────────────────────

function TicketCard({
  ticket,
  onRemove,
  onRefresh,
}: {
  ticket: SavedTicket;
  onRemove: (id: string) => void;
  onRefresh: () => void;
}) {
  const { wallet, connect } = useWallet();
  const [expanded, setExpanded] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<boolean | null>(
    ticket.isUsed === true ? false : null,
  );
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const qrPayload = JSON.stringify(
    ticket.claimTxId
      ? { ...ticket.secret, claimTxId: ticket.claimTxId }
      : ticket.secret,
  );

  const admittedDate = ticket.usedAt ? new Date(ticket.usedAt) : null;

  function copySecret() {
    navigator.clipboard.writeText(
      JSON.stringify(
        ticket.claimTxId
          ? { ...ticket.secret, claimTxId: ticket.claimTxId }
          : ticket.secret,
        null,
        2,
      ),
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function verify() {
    setVerifying(true);
    setVerifyResult(null);
    setVerifyError(null);
    try {
      const liveWallet = wallet ?? await connect();
      const [
        { createEventTicketProviders },
        { EventTicketAPI, hexToBigint },
        { PREPROD_CONFIG },
      ] = await Promise.all([
        import("@sdk/providers"),
        import("@sdk/contract-api"),
        import("@sdk/types"),
      ]);
      const providers = await createEventTicketProviders(liveWallet, PREPROD_CONFIG);
      const api = await EventTicketAPI.joinAsAttendee(
        providers,
        ticket.secret.contractAddress,
      );
      const { verified } = await api.verifyTicket(hexToBigint(ticket.secret.nonce));
      setVerifyResult(verified);
      if (!verified && !ticket.isUsed) {
        markTicketUsed(ticket.id);
        onRefresh();
      }
    } catch (err) {
      setVerifyError(err instanceof Error ? err.message : String(err));
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div
      className={`relative overflow-hidden border transition-colors duration-300 ${
        ticket.isUsed
          ? "border-amber-500/20 bg-amber-500/[0.03]"
          : "border-white/8 bg-white/[0.02]"
      }`}
    >
      {/* Amber left accent bar — only when admitted */}
      {ticket.isUsed && (
        <div className="absolute left-0 inset-y-0 w-[3px] bg-amber-500/60" />
      )}

      {/* ── Header row ─────────────────────────────────────────────── */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between gap-4 pl-5 pr-5 py-4 text-left"
      >
        <div className="min-w-0">
          <p
            className={`text-sm font-semibold truncate transition-colors ${
              ticket.isUsed ? "text-zinc-400" : "text-white"
            }`}
          >
            {ticket.eventName}
          </p>
          <p className="text-xs text-zinc-600 font-mono mt-0.5 truncate">
            {ticket.secret.contractAddress}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {ticket.isUsed && (
            <span className="text-[10px] font-bold tracking-widest uppercase border px-2 py-0.5 text-amber-400 border-amber-500/30 bg-amber-500/10">
              ADMITTED
            </span>
          )}
          {!ticket.isUsed && verifyResult === true && (
            <span className="text-xs border px-2 py-0.5 text-emerald-400 border-emerald-500/20 bg-emerald-500/5">
              Valid
            </span>
          )}
          <span className="text-xs text-zinc-600">{expanded ? "▲" : "▼"}</span>
        </div>
      </button>

      {/* ── Expanded detail ─────────────────────────────────────────── */}
      {expanded && (
        <div className="border-t border-white/6 px-5 py-4 space-y-4">

          {ticket.isUsed ? (
            /* ══ ADMITTED STATE ══════════════════════════════════════ */
            <>
              {/* QR — desaturated + circular stamp overlay */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs text-zinc-600 uppercase tracking-widest font-medium">
                    Ticket QR
                  </p>
                  <p className="text-[10px] font-bold tracking-widest text-amber-500/50 uppercase">
                    Void
                  </p>
                </div>

                {/* QR container — dark bg, desaturated code */}
                <div className="relative overflow-hidden bg-zinc-900 border border-amber-500/15">
                  {/* Washed-out QR underneath the stamp */}
                  <div
                    className="flex justify-center p-6"
                    style={{ filter: "grayscale(1) opacity(0.18)" }}
                  >
                    <QRCode value={qrPayload} size={176} />
                  </div>

                  {/* Circular rubber-stamp — animates in on expand */}
                  <motion.div
                    initial={{ scale: 2.2, opacity: 0, rotate: -28 }}
                    animate={{ scale: 1, opacity: 1, rotate: -14 }}
                    transition={{ type: "spring", stiffness: 500, damping: 24 }}
                    className="absolute inset-0 flex items-center justify-center"
                  >
                    <div className="relative flex items-center justify-center w-[168px] h-[168px]">
                      {/* Outer ring */}
                      <div className="absolute inset-0 rounded-full border-[3px] border-amber-400/85 shadow-[0_0_30px_rgba(245,158,11,0.22)]" />
                      {/* Inner ring */}
                      <div className="absolute inset-[7px] rounded-full border border-amber-400/30" />
                      {/* Stamp content */}
                      <div className="flex flex-col items-center gap-0.5 z-10">
                        <p className="text-amber-400 font-black text-[21px] leading-none tracking-[0.32em]">
                          ADMITTED
                        </p>
                        <div className="w-[88px] h-px bg-amber-400/50 my-1.5" />
                        <p className="text-amber-400/65 text-[9px] font-bold tracking-[0.28em] uppercase">
                          Entry Granted
                        </p>
                        {admittedDate && (
                          <p className="text-amber-400/45 text-[9px] font-mono mt-1.5">
                            {admittedDate.toLocaleDateString("en-GB", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })}
                          </p>
                        )}
                      </div>
                    </div>
                  </motion.div>
                </div>

                {/* Admission record strip below QR */}
                <div className="border-x border-b border-amber-500/15 bg-amber-500/[0.05] px-4 py-3 flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full border border-amber-500/35 bg-amber-500/10 flex items-center justify-center shrink-0">
                    <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
                      <path d="M1 5L4.5 8.5L11 1" stroke="rgb(251 191 36)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-amber-400/85">
                      Admitted at venue
                    </p>
                    {admittedDate ? (
                      <p className="text-[11px] text-zinc-500 mt-0.5">
                        {admittedDate.toLocaleString()}
                      </p>
                    ) : (
                      <p className="text-[11px] text-zinc-500 mt-0.5">
                        Admission recorded on-chain
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </>
          ) : (
            /* ══ VALID TICKET QR ════════════════════════════════════= */
            <div>
              <p className="text-xs text-zinc-500 mb-3">Venue QR code</p>
              <div className="flex flex-col items-center gap-3 bg-white p-5 border border-white/8">
                <QRCode value={qrPayload} size={180} />
                <p className="text-xs text-zinc-800">Show this at the venue entrance</p>
              </div>
            </div>
          )}

          {/* Secret preview — always shown */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-zinc-500">Secret</p>
              <button
                onClick={copySecret}
                className="text-xs text-zinc-600 hover:text-white transition-colors"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
            <pre className="text-xs font-mono text-zinc-500 whitespace-pre-wrap break-all bg-white/[0.02] border border-white/6 px-3 py-3">
              {JSON.stringify(
                ticket.claimTxId
                  ? { ...ticket.secret, claimTxId: ticket.claimTxId }
                  : ticket.secret,
                null,
                2,
              )}
            </pre>
          </div>

          {/* Verify — only for non-admitted tickets */}
          {!ticket.isUsed && (
            <div className="space-y-2">
              <button
                onClick={verify}
                disabled={verifying}
                className="w-full bg-white text-black text-xs font-semibold py-2.5 hover:bg-zinc-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                {verifying ? "Generating ZK proof…" : "Verify Ticket"}
              </button>
              {verifyResult === true && (
                <div className="border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
                  <p className="text-sm font-semibold text-emerald-400">Ticket valid</p>
                  <p className="text-xs text-zinc-500 mt-1">
                    Valid commitment found on-chain. No identity was revealed.
                  </p>
                </div>
              )}
              {verifyResult === false && (
                <div className="border border-amber-500/20 bg-amber-500/[0.04] px-4 py-3">
                  <p className="text-sm font-semibold text-amber-400">Ticket has been admitted</p>
                  <p className="text-xs text-zinc-500 mt-1">
                    This ticket is no longer valid — it was already used at the venue.
                  </p>
                </div>
              )}
              {verifyError && (
                <p className="text-xs text-red-400 break-all">{verifyError}</p>
              )}
            </div>
          )}

          {/* Remove */}
          <button
            onClick={() => onRemove(ticket.id)}
            className="text-xs text-zinc-700 hover:text-red-400 transition-colors"
          >
            Remove ticket
          </button>
        </div>
      )}
    </div>
  );
}
