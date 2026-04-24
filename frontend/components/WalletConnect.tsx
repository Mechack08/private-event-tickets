"use client";

import { useState, useEffect, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { createPortal } from "react-dom";
import { useWallet } from "@/contexts/WalletContext";
import type { AvailableWallet } from "@/hooks/useWallet";

// ─── helpers ─────────────────────────────────────────────────────────────────

function addrShort(addr: string | null): string | null {
  if (!addr) return null;
  return `${addr.slice(0, 12)}…${addr.slice(-6)}`;
}

function getDetected(availableWallets: AvailableWallet[]): AvailableWallet[] {
  if (availableWallets.length > 0) return availableWallets;
  if (typeof window === "undefined") return [];
  const mid = (window as unknown as { midnight?: Record<string, { name?: string; icon?: string }> }).midnight;
  if (!mid) return [];
  return Object.keys(mid).map((key) => {
    const w = mid[key];
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key);
    return {
      key,
      name: w?.name || (isUuid ? "Wallet" : key.replace(/^mn/i, "").replace(/([a-z])([A-Z])/g, "$1 $2")),
      icon: w?.icon,
    };
  });
}

// ─── Spinner ─────────────────────────────────────────────────────────────────

function Spinner({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className="animate-spin shrink-0"
    >
      <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

// ─── Shield icon (Midnight brand motif) ──────────────────────────────────────

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M12 2L4 6v6c0 4.42 3.36 8.56 8 9.56C17.64 20.56 21 16.42 21 12V6l-9-4z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M9 12l2 2 4-4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ─── WalletConnect (public API) ───────────────────────────────────────────────

/**
 * compact=true  → nav pill
 * compact=false → full inline card
 */
export function WalletConnect({ compact = false }: { compact?: boolean }) {
  const { status, shieldedPubkey, error, availableWallets, connect, disconnect } = useWallet();
  const [modalOpen, setModalOpen] = useState(false);

  const connected  = status === "connected";
  const connecting = status === "connecting";

  const openModal  = () => setModalOpen(true);
  const closeModal = useCallback(() => setModalOpen(false), []);

  // Close modal once connection succeeds
  useEffect(() => {
    if (connected) setModalOpen(false);
  }, [connected]);

  const short = addrShort(shieldedPubkey);

  // ── Compact nav pill ────────────────────────────────────────────────────
  if (compact) {
    if (connected) {
      return (
        <div className="flex items-center gap-1.5">
          <div className="hidden sm:flex items-center gap-2 border border-emerald-500/20 bg-emerald-500/[0.06] px-2.5 py-1 rounded-sm">
            <span className="relative flex h-1.5 w-1.5 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-50" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
            </span>
            <span className="text-[11px] text-emerald-300/80 font-mono leading-none">{short ?? "connected"}</span>
          </div>
          {/* mobile: dot */}
          <span className="sm:hidden relative flex h-2 w-2 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-50" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
          </span>
          <button
            onClick={disconnect}
            className="text-[11px] text-zinc-500 hover:text-red-400 px-2.5 py-1 border border-white/8 hover:border-red-500/30 transition-colors duration-150 cursor-pointer leading-none rounded-sm"
          >
            Disconnect
          </button>
        </div>
      );
    }

    return (
      <>
        <button
          onClick={openModal}
          disabled={connecting}
          className="relative group flex items-center gap-1.5 text-[11px] font-semibold tracking-wide border border-white/15 hover:border-white/30 bg-white/[0.04] hover:bg-white/[0.08] text-white disabled:opacity-40 px-3 py-1.5 transition-all duration-200 cursor-pointer leading-none overflow-hidden rounded-sm"
        >
          <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />
          {connecting ? <><Spinner size={11} /> Connecting…</> : <>
            <ShieldIcon className="w-3 h-3 text-zinc-400 group-hover:text-white transition-colors" />
            Connect Wallet
          </>}
        </button>
        <ConnectModal
          open={modalOpen}
          connecting={connecting}
          error={error}
          availableWallets={getDetected(availableWallets)}
          onConnect={connect}
          onClose={closeModal}
        />
      </>
    );
  }

  // ── Full inline card ────────────────────────────────────────────────────
  return (
    <>
      <div className="relative border border-white/8 bg-[#0c0c0c] mb-6 overflow-hidden rounded-sm">
        <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent pointer-events-none" />
        <div className="flex items-center justify-between gap-4 px-5 py-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`shrink-0 p-1.5 rounded-sm border ${
              connected  ? "border-emerald-500/25 bg-emerald-500/[0.08] text-emerald-400"
              : connecting ? "border-white/10 bg-white/[0.04] text-zinc-400"
              :              "border-white/8  bg-white/[0.03] text-zinc-600"
            }`}>
              <ShieldIcon className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white leading-none mb-1">
                {connected ? "Wallet connected" : connecting ? "Connecting…" : "Connect your wallet"}
              </p>
              {connected && short ? (
                <p className="text-[11px] text-zinc-500 font-mono truncate">{short}</p>
              ) : error ? (
                <p className="text-[11px] text-red-400 truncate max-w-xs">{error}</p>
              ) : (
                <p className="text-[11px] text-zinc-600">A Midnight-compatible wallet is required</p>
              )}
            </div>
          </div>
          <div className="shrink-0">
            {connected ? (
              <button
                onClick={disconnect}
                className="text-[11px] text-zinc-500 hover:text-red-400 border border-white/8 hover:border-red-500/25 px-3 py-1.5 transition-colors duration-150 cursor-pointer leading-none rounded-sm"
              >
                Disconnect
              </button>
            ) : (
              <button
                onClick={openModal}
                disabled={connecting}
                className="relative flex items-center gap-1.5 text-[11px] font-semibold border border-white/20 hover:border-white/35 bg-white/[0.05] hover:bg-white/[0.09] text-white disabled:opacity-40 px-4 py-2 transition-all duration-200 cursor-pointer leading-none overflow-hidden rounded-sm"
              >
                <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />
                {connecting ? <><Spinner size={11} /> Connecting…</> : "Connect Wallet"}
              </button>
            )}
          </div>
        </div>
      </div>
      <ConnectModal
        open={modalOpen}
        connecting={connecting}
        error={error}
        availableWallets={getDetected(availableWallets)}
        onConnect={connect}
        onClose={closeModal}
      />
    </>
  );
}

// ─── Connect Modal ────────────────────────────────────────────────────────────

function ConnectModal({
  open,
  connecting,
  error,
  availableWallets,
  onConnect,
  onClose,
}: {
  open: boolean;
  connecting: boolean;
  error: string | null;
  availableWallets: AvailableWallet[];
  onConnect: (key?: string) => Promise<void>;
  onClose: () => void;
}) {
  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Prevent body scroll while open
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-4"
          onClick={onClose}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

          {/* Panel */}
          <motion.div
            key="panel"
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-sm bg-[#0d0d0d] border border-white/10 shadow-2xl overflow-hidden rounded-sm"
          >
            {/* Top shimmer */}
            <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent pointer-events-none" />

            {/* Header */}
            <div className="flex items-start justify-between px-5 pt-5 pb-4 border-b border-white/6">
              <div className="flex items-center gap-3">
                <div className="p-2 border border-white/10 bg-white/[0.04] rounded-sm">
                  <ShieldIcon className="w-5 h-5 text-zinc-300" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-white leading-none mb-0.5">Connect wallet</h2>
                  <p className="text-[11px] text-zinc-500">Midnight Network · Preprod</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="text-zinc-600 hover:text-white transition-colors duration-150 p-1 -mr-1 cursor-pointer rounded-sm"
                aria-label="Close"
              >
                <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
                  <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            {/* Body */}
            <div className="px-5 py-4 space-y-2">
              {/* Connecting overlay */}
              <AnimatePresence>
                {connecting && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center gap-3 px-4 py-3 border border-white/8 bg-white/[0.03] rounded-sm"
                  >
                    <Spinner size={14} />
                    <span className="text-xs text-zinc-400">Waiting for wallet approval…</span>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Error */}
              <AnimatePresence>
                {error && !connecting && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="flex items-start gap-2 px-3.5 py-3 border border-red-500/20 bg-red-500/[0.06] rounded-sm"
                  >
                    <svg className="w-3.5 h-3.5 text-red-400 mt-px shrink-0" viewBox="0 0 16 16" fill="none">
                      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
                      <path d="M8 5v3.5M8 11h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                    <p className="text-[11px] text-red-300 leading-relaxed">{error}</p>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Wallet list */}
              {availableWallets.length > 0 ? (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-[0.12em] pb-0.5">
                    Detected wallets
                  </p>
                  {availableWallets.map(({ key, name, icon }, i) => (
                    <motion.button
                      key={key}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05, duration: 0.2 }}
                      onClick={() => void onConnect(key)}
                      disabled={connecting}
                      className="w-full flex items-center gap-3.5 px-4 py-3.5 border border-white/8 hover:border-white/18 bg-white/[0.02] hover:bg-white/[0.05] transition-all duration-150 cursor-pointer group disabled:opacity-50 rounded-sm text-left"
                    >
                      {icon ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={icon} alt="" className="w-8 h-8 rounded-sm shrink-0" />
                      ) : (
                        <div className="w-8 h-8 border border-white/10 bg-white/[0.04] flex items-center justify-center shrink-0 rounded-sm">
                          <ShieldIcon className="w-4 h-4 text-zinc-500 group-hover:text-zinc-300 transition-colors" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-zinc-200 group-hover:text-white transition-colors leading-none mb-0.5">{name}</p>
                        <p className="text-[10px] text-zinc-600">Midnight-compatible</p>
                      </div>
                      <svg className="w-4 h-4 text-zinc-700 group-hover:text-zinc-300 transition-colors shrink-0" viewBox="0 0 16 16" fill="none">
                        <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </motion.button>
                  ))}
                </div>
              ) : (
                <NoWalletState />
              )}
            </div>

            {/* Footer */}
            <div className="px-5 pb-5 pt-1">
              <p className="text-[10px] text-zinc-700 leading-relaxed">
                Your identity stays private.{" "}
                <span className="text-zinc-500">Zero-knowledge proofs keep your data off-chain.</span>
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

// ─── No wallet state ──────────────────────────────────────────────────────────

function NoWalletState() {
  return (
    <div className="flex flex-col items-center gap-3 py-6 px-3 text-center border border-dashed border-white/8 rounded-sm">
      <div className="p-3 border border-white/8 bg-white/[0.03] rounded-sm">
        <ShieldIcon className="w-6 h-6 text-zinc-600" />
      </div>
      <div>
        <p className="text-sm font-medium text-zinc-400 mb-1">No wallet detected</p>
        <p className="text-[11px] text-zinc-600 leading-relaxed">
          Install Lace and enable the Midnight network to continue.
        </p>
      </div>
      <a
        href="https://www.lace.io/"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white border border-white/10 hover:border-white/25 px-4 py-2 transition-all duration-150 rounded-sm"
      >
        Get Lace wallet
        <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none">
          <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </a>
    </div>
  );
}
