"use client";

import { useLaceWallet } from "@/hooks/useLaceWallet";

/**
 * WalletConnect
 *
 * Displays wallet connection state and exposes a connect/disconnect button.
 * This component is purely presentational — it reads from the useLaceWallet
 * hook and renders accordingly.
 */
export function WalletConnect() {
  const { status, shieldedPubkey, error, connect, disconnect } =
    useLaceWallet();

  const isConnected = status === "connected";
  const isConnecting = status === "connecting";

  return (
    <div className="card" style={{ marginBottom: "1.5rem" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1rem",
        }}
      >
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              marginBottom: "0.25rem",
            }}
          >
            {/* Status dot */}
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: isConnected
                  ? "var(--success)"
                  : status === "error"
                    ? "var(--error)"
                    : "var(--text-muted)",
                display: "inline-block",
                flexShrink: 0,
              }}
            />
            <span style={{ fontWeight: 600, fontSize: "0.95rem" }}>
              {isConnected
                ? "Wallet connected"
                : isConnecting
                  ? "Connecting…"
                  : status === "error"
                    ? "Connection failed"
                    : "Wallet not connected"}
            </span>
          </div>

          {isConnected && shieldedPubkey && (
            <div
              style={{
                fontSize: "0.78rem",
                color: "var(--text-muted)",
                wordBreak: "break-all",
              }}
            >
              Key: {shieldedPubkey.slice(0, 20)}…{shieldedPubkey.slice(-8)}
            </div>
          )}

          {error && (
            <div style={{ fontSize: "0.8rem", color: "var(--error)", marginTop: "0.25rem" }}>
              {error}
            </div>
          )}
        </div>

        <button
          className={isConnected ? "btn-secondary" : "btn-primary"}
          onClick={isConnected ? disconnect : connect}
          disabled={isConnecting}
          style={{ flexShrink: 0 }}
        >
          {isConnecting ? "Connecting…" : isConnected ? "Disconnect" : "Connect Lace"}
        </button>
      </div>
    </div>
  );
}
