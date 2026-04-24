/**
 * useWallet.ts
 *
 * React hook for connecting to any Midnight-compatible wallet via the
 * DApp Connector API (window.midnight).
 *
 * This hook manages ONLY the wallet (Lace / Midnight extension) connection.
 * Authentication (identity / session) is handled separately by AuthContext.
 *
 * Compatible wallets inject themselves into window.midnight:
 *   window.midnight = { mnLace: InitialAPI, "<uuid>": InitialAPI, ... }
 */

"use client";

import { useState, useCallback, useRef } from "react";

import type {
  InitialAPI,
  WalletConnectedAPI,
} from "@midnight-ntwrk/dapp-connector-api";

export type WalletStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

export interface AvailableWallet {
  key: string;
  name: string;
  icon?: string;
}

export interface WalletState {
  status: WalletStatus;
  wallet: WalletConnectedAPI | null;
  /** Bech32m shielded address from the connected wallet (for display). */
  shieldedPubkey: string | null;
  error: string | null;
  /** All detected Midnight wallets in window.midnight */
  availableWallets: AvailableWallet[];
  connect: (walletKey?: string) => Promise<WalletConnectedAPI>;
  disconnect: () => void;
}

/** Fallback name from a window.midnight key when InitialAPI.name is absent. */
function fallbackName(key: string): string {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key)) return "Wallet";
  return key.replace(/^mn/i, "").replace(/([a-z])([A-Z])/g, "$1 $2");
}

export function useWallet(): WalletState {
  const [status, setStatus]                   = useState<WalletStatus>("disconnected");
  const [wallet, setWallet]                   = useState<WalletConnectedAPI | null>(null);
  const [shieldedPubkey, setShieldedPubkey]   = useState<string | null>(null);
  const [error, setError]                     = useState<string | null>(null);
  const [availableWallets, setAvailableWallets] = useState<AvailableWallet[]>([]);

  const walletRef = useRef<WalletConnectedAPI | null>(null);

  const connect = useCallback(async (walletKey?: string): Promise<WalletConnectedAPI> => {
    // If already connected, return the existing wallet immediately.
    if (walletRef.current) return walletRef.current;

    setStatus("connecting");
    setError(null);

    try {
      // ── Detect wallets ────────────────────────────────────────────────
      const midnightObj = (window as unknown as { midnight?: Record<string, InitialAPI> }).midnight;
      if (!midnightObj || Object.keys(midnightObj).length === 0) {
        throw new Error(
          "No Midnight wallet detected. Install a Midnight-compatible wallet (e.g. Lace) and enable the Midnight network.",
        );
      }

      const detected: AvailableWallet[] = Object.keys(midnightObj).map((key) => {
        const w = midnightObj[key];
        return { key, name: w.name || fallbackName(key), icon: w.icon };
      });
      setAvailableWallets(detected);

      const selectedKey = walletKey && midnightObj[walletKey] ? walletKey : Object.keys(midnightObj)[0];
      const initialApi  = midnightObj[selectedKey];
      if (typeof initialApi?.connect !== "function") {
        throw new Error("Wallet found but does not expose a connect() method.");
      }

      // ── Request connection ─────────────────────────────────────────────
      const connected = await initialApi.connect("preprod");

      walletRef.current = connected as WalletConnectedAPI;
      setWallet(connected as WalletConnectedAPI);

      // ── Fetch shielded address (display only) ─────────────────────────
      try {
        const addresses = await connected.getShieldedAddresses();
        setShieldedPubkey(addresses.shieldedAddress ?? null);
      } catch {
        console.warn("Could not fetch shielded address from wallet.");
      }

      setStatus("connected");
      return connected as WalletConnectedAPI;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setStatus("error");
      throw err;
    }
  }, []);

  const disconnect = useCallback(() => {
    walletRef.current = null;
    setWallet(null);
    setShieldedPubkey(null);
    setStatus("disconnected");
    setError(null);
  }, []);

  return { status, wallet, shieldedPubkey, error, availableWallets, connect, disconnect };
}
