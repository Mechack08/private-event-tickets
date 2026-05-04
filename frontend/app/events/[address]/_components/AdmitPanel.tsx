"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { motion, AnimatePresence } from "framer-motion";
import type { AdmitTicketState, UseAdmitTicketReturn } from "@/hooks/useAdmitTicket";

const QrScannerWidget = dynamic<{ onScan: (r: string) => boolean; onError?: (e: string) => void }>(
  () => import("@/components/QrScannerWidget"),
  {
    ssr: false,
    loading: () => (
      <div className="w-full aspect-square bg-black flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    ),
  },
);

interface AdmitPanelProps {
  isCancelled: boolean;
  admit: UseAdmitTicketReturn;
}

/** The full admit-ticket UI: mode toggle, QR scanner, manual nonce input, and result overlays. */
export function AdmitPanel({ isCancelled, admit }: AdmitPanelProps) {
  const { state, submitAdmit, handleQrScan, resetAdmit, setScanActive, setAdmitMode, setCameraPermissionDenied } = admit;
  const {
    admitting, admitRetry, admitResult, admitError,
    lastAdmittedAt, lastAdmittedNonce,
    scanActive, cameraPermissionDenied,
    pendingNonce, pendingClaimTxId, admittedNonces,
  } = state;

  const [admitMode, setMode] = useState<"scan" | "manual">("manual");
  const [nonceInput, setNonceInput] = useState("");

  function switchMode(m: "scan" | "manual") {
    setMode(m);
    setAdmitMode(m);
    if (m === "scan") setCameraPermissionDenied(false);
  }

  function handleAdmitSuccess() {
    setNonceInput("");
    resetAdmit(admitMode === "scan");
  }

  const retryLabel = admitRetry
    ? `Wallet syncing, retrying… (${admitRetry.attempt}/${admitRetry.max})`
    : "Submitting ZK proof…";

  return (
    <div className="space-y-5">
      {/* ── Success overlay ─────────────────────────────────────────── */}
      <AnimatePresence>
        {admitResult === "success" && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 400, damping: 28 }}
            className="border border-emerald-500/25 bg-emerald-500/[0.05] px-5 py-6 flex flex-col items-center gap-4 text-center"
          >
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
              onClick={handleAdmitSuccess}
              className="text-xs font-semibold text-white border border-white/15 bg-white/[0.04] hover:bg-white/[0.08] px-5 py-2 transition-colors"
            >
              Scan Next →
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Error overlay ────────────────────────────────────────────── */}
      <AnimatePresence>
        {admitResult === "error" && admitError && (() => {
          const isAlreadyUsed =
            /already used|ticket already/i.test(admitError);
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
              <button
                onClick={() => resetAdmit(admitMode === "scan")}
                className="text-xs text-zinc-400 hover:text-white border border-white/8 hover:border-white/20 px-3 py-1.5 transition-colors"
              >
                {isAlreadyUsed ? "Scan next ticket →" : "Try again"}
              </button>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      {/* ── Main admit UI (hidden while showing result) ───────────────── */}
      {admitResult === null && (
        <>
          {/* Mode toggle */}
          <div className="flex gap-0 border border-white/8 p-1 bg-white/[0.02]">
            {(["scan", "manual"] as const).map((m) => (
              <button
                key={m}
                onClick={() => switchMode(m)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors ${
                  admitMode === m ? "bg-white text-black" : "text-zinc-500 hover:text-white"
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

          {/* ── QR scan mode ─────────────────────────────────────────── */}
          {admitMode === "scan" && (
            <AnimatePresence mode="wait">
              {!pendingNonce ? (
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
                          if (/NotAllowed|Permission|permission/i.test(msg)) {
                            switchMode("manual");
                            setCameraPermissionDenied(true);
                          } else {
                            switchMode("manual");
                          }
                        }}
                      />
                    )}
                    {/* Crosshair overlay */}
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                      <div className="relative w-48 h-48">
                        {([["top-0 left-0", "border-t border-l"], ["top-0 right-0", "border-t border-r"],
                           ["bottom-0 left-0", "border-b border-l"], ["bottom-0 right-0", "border-b border-r"]] as const)
                          .map(([pos, cls], i) => (
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
                      ? retryLabel
                      : "Point camera at attendee's ticket QR code"}
                  </p>
                  {!scanActive && !admitting && (
                    <button
                      onClick={() => setScanActive(true)}
                      className="w-full text-xs text-zinc-400 hover:text-white border border-white/8 py-2 transition-colors"
                    >
                      Start scanning
                    </button>
                  )}
                </motion.div>
              ) : (
                /* ── Scanned ticket confirm card ───────────────────── */
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
                          <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75" />
                          </svg>
                        )}
                      </motion.div>
                      <motion.div initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }}>
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

                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.26 }}
                      className="bg-black/40 border border-white/6 px-3 py-2.5"
                    >
                      <p className="text-[9px] font-mono text-zinc-600 uppercase tracking-widest mb-1">Ticket nonce</p>
                      <p className="text-xs font-mono text-zinc-300 break-all">
                        {pendingNonce.slice(0, 14)}<span className="text-zinc-600">…</span>{pendingNonce.slice(-10)}
                      </p>
                    </motion.div>

                    <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.32 }}
                      className="flex gap-2 pt-1"
                    >
                      <button
                        className="flex-1 text-xs text-zinc-400 hover:text-white border border-white/8 hover:border-white/20 py-3 transition-colors"
                        onClick={() => resetAdmit(true)}
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

          {/* ── Manual nonce mode ──────────────────────────────────────── */}
          {admitMode === "manual" && (
            <div className="space-y-3">
              {cameraPermissionDenied && (
                <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 px-3 py-2.5 text-xs text-amber-400">
                  <svg className="w-3.5 h-3.5 mt-0.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  </svg>
                  <span>Camera access denied. Allow camera permission in your browser settings, or enter the nonce manually below.</span>
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
                {admitting ? retryLabel : isCancelled ? "Event is cancelled" : "Admit Attendee"}
              </button>
            </div>
          )}

          {isCancelled && (
            <p className="text-xs text-zinc-600 text-center">This event has been cancelled.</p>
          )}
        </>
      )}
    </div>
  );
}
