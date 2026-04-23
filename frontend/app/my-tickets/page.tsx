"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Nav } from "@/components/Nav";
import { WalletConnect } from "@/components/WalletConnect";
import { useWallet } from "@/contexts/WalletContext";
import {
  getMyTickets,
  saveTicket,
  removeTicket,
  type SavedTicket,
} from "@/lib/storage";

export default function MyTicketsPage() {
  const { status, wallet } = useWallet();
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
              <p className="text-zinc-600 text-sm">No tickets saved yet.</p>
              <p className="text-zinc-700 text-xs mt-2">
                Request a ticket on an event page, or import a secret above.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {tickets.map((ticket) => (
                <TicketCard
                  key={ticket.id}
                  ticket={ticket}
                  walletReady={status === "connected" && wallet !== null}
                  onRemove={handleRemove}
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
  walletReady,
  onRemove,
}: {
  ticket: SavedTicket;
  walletReady: boolean;
  onRemove: (id: string) => void;
}) {
  const { wallet } = useWallet();
  const [expanded, setExpanded] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<boolean | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function copySecret() {
    navigator.clipboard.writeText(
      JSON.stringify(ticket.secret, null, 2),
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function verify() {
    if (!walletReady || !wallet) return;
    setVerifying(true);
    setVerifyResult(null);
    setVerifyError(null);
    try {
      const [
        { createEventTicketProviders },
        { EventTicketAPI, hexToBigint },
        { PREPROD_CONFIG },
      ] = await Promise.all([
        import("@sdk/providers"),
        import("@sdk/contract-api"),
        import("@sdk/types"),
      ]);
      const providers = await createEventTicketProviders(wallet, PREPROD_CONFIG);
      const api = await EventTicketAPI.join(
        providers,
        ticket.secret.contractAddress,
      );
      const { verified } = await api.verifyTicket(
        hexToBigint(ticket.secret.nonce),
      );
      setVerifyResult(verified);
    } catch (err) {
      setVerifyError(err instanceof Error ? err.message : String(err));
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div className="border border-white/8 bg-white/[0.02]">
      {/* Header row */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left"
      >
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white truncate">
            {ticket.eventName}
          </p>
          <p className="text-xs text-zinc-600 font-mono mt-0.5 truncate">
            {ticket.secret.contractAddress}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {verifyResult !== null && (
            <span
              className={`text-xs border px-2 py-0.5 ${
                verifyResult
                  ? "text-emerald-400 border-emerald-500/20 bg-emerald-500/5"
                  : "text-red-400 border-red-500/20 bg-red-500/5"
              }`}
            >
              {verifyResult ? "Valid" : "Invalid"}
            </span>
          )}
          <span className="text-xs text-zinc-600">
            {expanded ? "▲" : "▼"}
          </span>
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-white/6 px-5 py-4 space-y-4">
          {/* Secret preview */}
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
              {JSON.stringify(ticket.secret, null, 2)}
            </pre>
          </div>

          {/* Verify */}
          <div className="space-y-2">
            {!walletReady && <WalletConnect />}
            <button
              onClick={verify}
              disabled={verifying || !walletReady}
              className="w-full bg-white text-black text-xs font-semibold py-2.5 hover:bg-zinc-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              {verifying ? "Generating ZK proof…" : "Verify Ticket"}
            </button>
            {verifyResult !== null && (
              <div
                className={`border px-4 py-3 ${
                  verifyResult
                    ? "border-emerald-500/20 bg-emerald-500/5"
                    : "border-red-500/20 bg-red-500/5"
                }`}
              >
                <p
                  className={`text-sm font-semibold ${
                    verifyResult ? "text-emerald-400" : "text-red-400"
                  }`}
                >
                  {verifyResult ? "Ticket verified" : "Verification failed"}
                </p>
                <p className="text-xs text-zinc-500 mt-1">
                  {verifyResult
                    ? "Valid commitment found on-chain. No identity was revealed."
                    : "No matching commitment. Check your secret or wallet."}
                </p>
              </div>
            )}
            {verifyError && (
              <p className="text-xs text-red-400 break-all">{verifyError}</p>
            )}
          </div>

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
