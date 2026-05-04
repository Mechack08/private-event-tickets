"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import QRCode from "react-qr-code";
import { motion } from "framer-motion";
import { AdmittedStamp } from "@/components/AdmittedStamp";
import { ClaimModal } from "./ClaimModal";
import { ShareHint } from "./ShareHint";
import { useClaimTicket } from "@/hooks/useClaimTicket";
import { useOnChainState } from "@/hooks/useOnChainState";
import { getMyTickets, markTicketUsed, type StoredEvent, type SavedTicket } from "@/lib/storage";
import { api } from "@/lib/api";

interface AttendeeViewProps {
  address: string;
  event: StoredEvent | null;
}

/**
 * Attendee-facing view: shows the claim form if no ticket exists locally,
 * or the ticket QR (admitted or valid) if one has already been claimed.
 */
export function AttendeeView({ address, event }: AttendeeViewProps) {
  const existingTicket = getMyTickets().find((t) => t.contractAddress === address);
  const [savedTicket, setSavedTicket] = useState<SavedTicket | null>(existingTicket ?? null);
  const [showModal, setShowModal] = useState(false);

  const { onChainMinAge } = useOnChainState(address, event?.minAge ?? 0);
  const { claiming, claimError, handleClaim, clearError } = useClaimTicket(
    address,
    onChainMinAge,
    event?.eventName ?? address,
  );

  // Silent admission sync — detect if an existing local ticket was admitted since last visit.
  useEffect(() => {
    if (!savedTicket || savedTicket.isUsed) return;

    api.tickets
      .mine()
      .then((backendTickets) => {
        const bt = backendTickets.find((t) => t.claimTxId === savedTicket.claimTxId);
        if (bt?.isVerified) {
          markTicketUsed(savedTicket.id, bt.verifiedAt ?? undefined);
          setSavedTicket((t) =>
            t ? { ...t, isUsed: true, usedAt: bt.verifiedAt ?? new Date().toISOString() } : t,
          );
        }
      })
      .catch(() => {});
  }, [savedTicket?.id]);

  async function handleModalSubmit(dob: string) {
    const ticket = await handleClaim(dob);
    if (ticket) {
      setSavedTicket(ticket);
      setShowModal(false);
    }
  }

  // ── Ticket already claimed ─────────────────────────────────────────────────
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
          <h2 className={`text-lg font-bold ${savedTicket.isUsed ? "text-zinc-400" : "text-white"}`}>
            {savedTicket.eventName}
          </h2>
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
              /* ── Admitted state ─────────────────────────────────── */
              <>
                <div className="relative w-[212px] h-[212px] bg-zinc-900 border border-amber-500/15 flex items-center justify-center">
                  <div style={{ filter: "grayscale(1) opacity(0.15)" }}>
                    <QRCode value={qrValue} size={176} />
                  </div>
                  <AdmittedStamp admittedDate={admittedDate} />
                </div>

                {/* Record strip */}
                <div className="w-full border border-t-0 border-amber-500/15 bg-amber-500/[0.05] px-4 py-3 flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full border border-amber-500/35 bg-amber-500/10 flex items-center justify-center shrink-0">
                    <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
                      <path d="M1 5L4.5 8.5L11 1" stroke="rgb(251 191 36)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
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
              /* ── Valid ticket QR ────────────────────────────────── */
              <>
                <div className="relative">
                  <motion.div
                    initial={{ scale: 0.7, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.2, type: "spring", stiffness: 280, damping: 22 }}
                    className="relative z-10 bg-white p-4"
                  >
                    <QRCode value={qrValue} size={180} />
                  </motion.div>
                  <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: [0.9, 1.12, 0.9], opacity: [0, 0.15, 0] }}
                    transition={{ delay: 0.45, duration: 1.8, repeat: 2, ease: "easeInOut" }}
                    className="absolute inset-0 bg-white blur-xl pointer-events-none"
                  />
                </div>

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
            <p className="text-[10px] font-mono text-zinc-600 break-all leading-relaxed select-all">
              {savedTicket.secret.nonce}
            </p>
            <p className="text-[9px] text-zinc-700 mt-2">
              Received{" "}
              {new Date(savedTicket.receivedAt).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </p>
          </motion.div>
        </motion.div>

        {/* Floating particles (valid ticket only) */}
        {!savedTicket.isUsed && (
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
        )}

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.75 }}
          className="pt-5"
        >
          <Link
            href="/my-tickets"
            className="block text-center text-xs text-zinc-500 hover:text-white transition-colors underline underline-offset-4"
          >
            View all my tickets →
          </Link>
        </motion.div>
      </motion.div>
    );
  }

  // ── No ticket — show claim prompt ──────────────────────────────────────────
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
                {eventEnd &&
                  ` Ended ${eventEnd.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}.`}
              </p>
            </div>
          </div>
        ) : (
          <>
            <p className="text-sm text-zinc-500 leading-relaxed">
              Claim a ticket with a zero-knowledge age proof.
              {onChainMinAge > 0 && ` You must be ${onChainMinAge}+ years old.`}
              {" "}Your date of birth stays private — only the proof is submitted on-chain.
            </p>
            <button
              onClick={() => setShowModal(true)}
              className="w-full bg-white text-black text-sm font-semibold py-3 hover:bg-zinc-100 transition-colors"
            >
              Claim Ticket
            </button>
          </>
        )}
      </div>

      <ShareHint address={address} />

      {showModal && (
        <ClaimModal
          minAge={onChainMinAge}
          claiming={claiming}
          claimError={claimError}
          onSubmit={handleModalSubmit}
          onClose={() => setShowModal(false)}
          onClearError={clearError}
        />
      )}
    </div>
  );
}
