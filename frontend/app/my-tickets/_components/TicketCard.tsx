"use client";

import { useState } from "react";
import QRCode from "react-qr-code";
import { motion } from "framer-motion";
import { useWallet } from "@/contexts/WalletContext";
import { markTicketUsed, type SavedTicket } from "@/lib/storage";

interface TicketCardProps {
  ticket: SavedTicket;
  onRemove: (id: string) => void;
  onRefresh: () => void;
}

export function TicketCard({ ticket, onRemove, onRefresh }: TicketCardProps) {
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
      const liveWallet = wallet ?? (await connect());
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
      const contractApi = await EventTicketAPI.joinAsAttendee(
        providers,
        ticket.secret.contractAddress,
      );
      const { verified } = await contractApi.verifyTicket(hexToBigint(ticket.secret.nonce));
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
      {ticket.isUsed && (
        <div className="absolute left-0 inset-y-0 w-[3px] bg-amber-500/60" />
      )}

      {/* Header row */}
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

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-white/6 px-5 py-4 space-y-4">
          {ticket.isUsed ? (
            <AdmittedQr qrPayload={qrPayload} admittedDate={admittedDate} />
          ) : (
            <ValidQr qrPayload={qrPayload} />
          )}

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
              {JSON.stringify(
                ticket.claimTxId
                  ? { ...ticket.secret, claimTxId: ticket.claimTxId }
                  : ticket.secret,
                null,
                2,
              )}
            </pre>
          </div>

          {/* ZK verify — only for non-admitted tickets */}
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

// ─── Sub-components ────────────────────────────────────────────────────────────

function AdmittedQr({
  qrPayload,
  admittedDate,
}: {
  qrPayload: string;
  admittedDate: Date | null;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-zinc-600 uppercase tracking-widest font-medium">Ticket QR</p>
        <p className="text-[10px] font-bold tracking-widest text-amber-500/50 uppercase">Void</p>
      </div>

      <div className="relative overflow-hidden bg-zinc-900 border border-amber-500/15">
        <div
          className="flex justify-center p-6"
          style={{ filter: "grayscale(1) opacity(0.18)" }}
        >
          <QRCode value={qrPayload} size={176} />
        </div>

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

      <div className="border-x border-b border-amber-500/15 bg-amber-500/[0.05] px-4 py-3 flex items-center gap-3">
        <div className="w-7 h-7 rounded-full border border-amber-500/35 bg-amber-500/10 flex items-center justify-center shrink-0">
          <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
            <path
              d="M1 5L4.5 8.5L11 1"
              stroke="rgb(251 191 36)"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-amber-400/85">Admitted at venue</p>
          {admittedDate ? (
            <p className="text-[11px] text-zinc-500 mt-0.5">{admittedDate.toLocaleString()}</p>
          ) : (
            <p className="text-[11px] text-zinc-500 mt-0.5">Admission recorded on-chain</p>
          )}
        </div>
      </div>
    </div>
  );
}

function ValidQr({ qrPayload }: { qrPayload: string }) {
  return (
    <div>
      <p className="text-xs text-zinc-500 mb-3">Venue QR code</p>
      <div className="flex flex-col items-center gap-3 bg-white p-5 border border-white/8">
        <QRCode value={qrPayload} size={180} />
        <p className="text-xs text-zinc-800">Show this at the venue entrance</p>
      </div>
    </div>
  );
}
