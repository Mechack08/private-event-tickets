"use client";

import { useState, useRef, useEffect } from "react";
import { useWallet } from "@/contexts/WalletContext";
import type { AvailableWallet } from "@/hooks/useWallet";

/**
 * compact=true  → minimal pill for the Nav bar
 * compact=false → full card for page-level wallet prompts
 */
export function WalletConnect({ compact = false }: { compact?: boolean }) {
  const { status, shieldedPubkey, error, availableWallets, connect, disconnect } = useWallet();
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  const connected  = status === "connected";
  const connecting = status === "connecting";
  const hasError   = status === "error";

  function getDetected(): AvailableWallet[] {
    if (availableWallets.length > 0) return availableWallets;
    const mid = (window as unknown as { midnight?: Record<string, { name?: string; icon?: string }> }).midnight;
    if (!mid) return [];
    return Object.keys(mid).map((key) => {
      const api = mid[key];
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key);
      return {
        key,
        name: api?.name || (isUuid ? "Wallet" : key.replace(/^mn/i, "").replace(/([a-z])([A-Z])/g, "$1 $2")),
        icon: api?.icon,
      };
    });
  }

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node))
        setPickerOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function handleConnectClick() {
    const detected = getDetected();
    if (detected.length > 1) setPickerOpen((p) => !p);
    else void connect(detected[0]?.key);
  }

  function handlePickWallet(key: string) {
    setPickerOpen(false);
    void connect(key);
  }

  const addrShort = shieldedPubkey
    ? `${shieldedPubkey.slice(0, 10)}…${shieldedPubkey.slice(-6)}`
    : null;

  // ── Compact (nav) variant ─────────────────────────────────────────────────
  if (compact) {
    if (connected) {
      return (
        <div className="flex items-center gap-1.5">
          {/* address pill */}
          <div className="hidden sm:flex items-center gap-1.5 border border-white/10 bg-white/[0.03] px-2.5 py-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
            <span className="text-[11px] text-zinc-300 font-mono leading-none">
              {addrShort ?? "connected"}
            </span>
          </div>
          {/* mobile: dot only */}
          <span className="sm:hidden w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
          <button
            onClick={disconnect}
            className="text-[11px] text-zinc-500 hover:text-zinc-200 border border-white/10 hover:border-white/20 px-2.5 py-1 transition-colors duration-150 cursor-pointer leading-none"
          >
            Disconnect
          </button>
        </div>
      );
    }

    return (
      <div className="relative" ref={pickerRef}>
        <button
          onClick={handleConnectClick}
          disabled={connecting}
          className="relative text-[11px] font-semibold tracking-wide border border-white/20 bg-white/[0.06] hover:bg-white/[0.10] text-white disabled:opacity-40 disabled:cursor-not-allowed px-3 py-1.5 transition-colors duration-150 cursor-pointer leading-none overflow-hidden group"
        >
          {/* shimmer line */}
          <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
          {connecting ? (
            <span className="flex items-center gap-1.5">
              <Spinner /> Connecting…
            </span>
          ) : "Connect Wallet"}
        </button>
        {pickerOpen && (
          <WalletPicker wallets={getDetected()} onPick={handlePickWallet} onClose={() => setPickerOpen(false)} />
        )}
      </div>
    );
  }

  // ── Full (page) variant ───────────────────────────────────────────────────
  return (
    <div className="relative border border-white/8 bg-[#0d0d0d] mb-6 overflow-hidden">
      {/* top shimmer */}
      <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent pointer-events-none" />

      <div className="flex items-center justify-between gap-4 px-5 py-4">
        {/* left: status indicator + text */}
        <div className="flex items-center gap-3 min-w-0">
          <StatusDot connected={connected} connecting={connecting} hasError={hasError} />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white leading-none mb-1">
              {connected   ? "Wallet connected"
               : connecting ? "Connecting…"
               : hasError   ? "Connection failed"
               :              "Connect your wallet"}
            </p>
            {connected && addrShort ? (
              <p className="text-[11px] text-zinc-500 font-mono truncate">{addrShort}</p>
            ) : hasError && error ? (
              <p className="text-[11px] text-red-400 truncate max-w-xs">{error}</p>
            ) : (
              <p className="text-[11px] text-zinc-600 leading-snug">
                A Midnight-compatible wallet is required
              </p>
            )}
          </div>
        </div>

        {/* right: action */}
        <div className="relative shrink-0" ref={connected ? undefined : pickerRef}>
          {connected ? (
            <button
              onClick={disconnect}
              className="text-[11px] text-zinc-500 hover:text-zinc-200 border border-white/10 hover:border-white/20 px-3 py-1.5 transition-colors duration-150 cursor-pointer leading-none"
            >
              Disconnect
            </button>
          ) : (
            <>
              <button
                onClick={handleConnectClick}
                disabled={connecting}
                className="relative text-[11px] font-semibold tracking-wide border border-white/20 bg-white/[0.06] hover:bg-white/[0.10] text-white disabled:opacity-40 disabled:cursor-not-allowed px-4 py-2 transition-colors duration-150 cursor-pointer leading-none overflow-hidden"
              >
                <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
                {connecting ? (
                  <span className="flex items-center gap-1.5">
                    <Spinner /> Connecting…
                  </span>
                ) : "Connect Wallet"}
              </button>
              {pickerOpen && (
                <WalletPicker wallets={getDetected()} onPick={handlePickWallet} onClose={() => setPickerOpen(false)} />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Status dot with pulse animation ──────────────────────────────────────────
function StatusDot({ connected, connecting, hasError }: { connected: boolean; connecting: boolean; hasError: boolean }) {
  if (connecting) {
    return (
      <span className="relative shrink-0 w-2 h-2">
        <span className="absolute inset-0 rounded-full bg-zinc-400 animate-ping opacity-60" />
        <span className="relative w-2 h-2 rounded-full bg-zinc-400 block" />
      </span>
    );
  }
  return (
    <span
      className={`shrink-0 w-2 h-2 rounded-full ${
        connected ? "bg-emerald-400" : hasError ? "bg-red-400" : "bg-zinc-700"
      }`}
    />
  );
}

// ── Minimal spinner ───────────────────────────────────────────────────────────
function Spinner() {
  return (
    <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

// ── Wallet picker dropdown ────────────────────────────────────────────────────
function WalletPicker({
  wallets,
  onPick,
  onClose,
}: {
  wallets: AvailableWallet[];
  onPick: (key: string) => void;
  onClose: () => void;
}) {
  if (wallets.length === 0) {
    return (
      <div className="absolute right-0 top-full mt-1.5 z-50 w-64 border border-white/10 bg-[#0d0d0d] shadow-2xl overflow-hidden">
        <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
        <div className="px-4 py-4">
          <p className="text-xs font-semibold text-white mb-1.5">No wallet detected</p>
          <p className="text-[11px] text-zinc-500 leading-relaxed mb-3">
            Install a Midnight-compatible wallet and enable the Midnight network.
          </p>
          <a
            href="https://www.lace.io/"
            target="_blank"
            rel="noopener noreferrer"
            onClick={onClose}
            className="inline-flex items-center gap-1 text-[11px] text-zinc-400 hover:text-white transition-colors duration-150"
          >
            Get Lace
            <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none">
              <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute right-0 top-full mt-1.5 z-50 w-56 border border-white/10 bg-[#0d0d0d] shadow-2xl overflow-hidden">
      <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
      <p className="text-[9px] font-semibold text-zinc-600 uppercase tracking-[0.12em] px-3.5 pt-3.5 pb-1.5">
        Choose wallet
      </p>
      <div className="pb-1.5">
        {wallets.map(({ key, name, icon }) => (
          <button
            key={key}
            onClick={() => onPick(key)}
            className="w-full text-left flex items-center gap-3 px-3.5 py-2.5 hover:bg-white/[0.05] transition-colors duration-100 cursor-pointer group"
          >
            {icon ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={icon} alt="" className="w-5 h-5 rounded shrink-0" />
            ) : (
              <span className="w-5 h-5 border border-white/15 flex items-center justify-center shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 group-hover:bg-zinc-300 transition-colors" />
              </span>
            )}
            <span className="text-sm text-zinc-300 group-hover:text-white transition-colors duration-100 leading-none">
              {name}
            </span>
            <svg className="w-3 h-3 text-zinc-700 group-hover:text-zinc-400 ml-auto transition-colors duration-100" viewBox="0 0 16 16" fill="none">
              <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        ))}
      </div>
    </div>
  );
}
