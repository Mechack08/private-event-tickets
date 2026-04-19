"use client";

import { useWallet } from "@/contexts/WalletContext";

/**
 * compact=true → minimal inline row for the Nav bar
 * compact=false (default) → full banner for page-level wallet prompt
 */
export function WalletConnect({ compact = false }: { compact?: boolean }) {
  const { status, shieldedPubkey, error, connect, disconnect } = useWallet();

  const connected = status === "connected";
  const connecting = status === "connecting";

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        {connected ? (
          <>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
            <span className="text-xs text-zinc-400 font-mono hidden sm:block">
              {shieldedPubkey
                ? `${shieldedPubkey.slice(0, 8)}…${shieldedPubkey.slice(-4)}`
                : "connected"}
            </span>
            <button
              onClick={disconnect}
              className="text-xs text-zinc-500 hover:text-white border border-white/10 hover:border-white/25 px-2.5 py-1 rounded-md transition-colors cursor-pointer"
            >
              Disconnect
            </button>
          </>
        ) : (
          <button
            onClick={connect}
            disabled={connecting}
            className="text-xs font-medium bg-white text-black hover:bg-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed px-3 py-1.5 rounded-md transition-colors cursor-pointer"
          >
            {connecting ? "Connecting…" : "Connect Wallet"}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/4 px-4 py-3 mb-6">
      <div className="flex items-center gap-3 min-w-0">
        <span
          className={`shrink-0 w-2 h-2 rounded-full ${
            connected ? "bg-emerald-400" : status === "error" ? "bg-red-400" : "bg-zinc-600"
          }`}
        />
        <div className="min-w-0">
          <p className="text-sm font-medium text-white leading-none mb-0.5">
            {connected ? "Wallet connected" : connecting ? "Connecting…" : status === "error" ? "Connection failed" : "Wallet not connected"}
          </p>
          {connected && shieldedPubkey ? (
            <p className="text-xs text-zinc-500 font-mono truncate">
              {shieldedPubkey.slice(0, 10)}…{shieldedPubkey.slice(-6)}
            </p>
          ) : status === "error" && error ? (
            <p className="text-xs text-red-400 truncate">{error}</p>
          ) : (
            <p className="text-xs text-zinc-600">Lace wallet required</p>
          )}
        </div>
      </div>

      {connected ? (
        <button
          onClick={disconnect}
          className="shrink-0 text-xs text-zinc-400 hover:text-white border border-white/10 hover:border-white/25 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
        >
          Disconnect
        </button>
      ) : (
        <button
          onClick={connect}
          disabled={connecting}
          className="shrink-0 text-xs font-medium bg-white text-black hover:bg-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
        >
          {connecting ? "Connecting…" : "Connect Lace"}
        </button>
      )}
    </div>
  );
}
