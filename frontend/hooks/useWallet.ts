/**
 * useWallet.ts
 *
 * React hook for connecting to any Midnight-compatible wallet via the
 * DApp Connector API (window.midnight).
 *
 * Compatible wallets inject themselves into window.midnight:
 *   window.midnight = { mnLace: InitialAPI, "<uuid>": InitialAPI, ... }
 *
 * The hook discovers all available wallets so the UI can show a picker,
 * then connects to whichever one the user selects.
 */

"use client";

import { useState, useCallback, useRef } from "react";

// We import types only — no runtime code from the Midnight SDK is imported
// here to avoid SSR crashes.  The InitialAPI / WalletConnectedAPI interfaces
// are pure TypeScript types and produce no JS output.
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
  /** Hex-encoded shielded public key (available after connect). */
  shieldedPubkey: string | null;
  error: string | null;
  /** All detected Midnight wallets in window.midnight */
  availableWallets: AvailableWallet[];
  connect: (walletKey?: string) => Promise<void>;
  disconnect: () => void;
}

/** Fallback name from a window.midnight key when InitialAPI.name is absent. */
function fallbackName(key: string): string {
  // UUID-shaped keys have no useful semantic — fall back to "Wallet"
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key)) return "Wallet";
  return key.replace(/^mn/i, "").replace(/([a-z])([A-Z])/g, "$1 $2");
}

export function useWallet(): WalletState {
  const [status, setStatus] = useState<WalletStatus>("disconnected");
  const [wallet, setWallet] = useState<WalletConnectedAPI | null>(null);
  const [shieldedPubkey, setShieldedPubkey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [availableWallets, setAvailableWallets] = useState<AvailableWallet[]>([]);

  // Keep a stable ref to the connected wallet for teardown
  const walletRef = useRef<WalletConnectedAPI | null>(null);

  const connect = useCallback(async (walletKey?: string) => {
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

      // Build available wallet list (used by picker UI).
      // Use InitialAPI.name (and .icon) when available — this correctly
      // handles UUID-keyed entries (CAIP-372 format) used by modern wallets.
      const detected: AvailableWallet[] = Object.keys(midnightObj).map((key) => {
        const api = midnightObj[key];
        return {
          key,
          name: api.name || fallbackName(key),
          icon: api.icon,
        };
      });
      setAvailableWallets(detected);

      // Select requested wallet key or fall back to first
      const selectedKey = walletKey && midnightObj[walletKey] ? walletKey : Object.keys(midnightObj)[0];
      const initialApi = midnightObj[selectedKey];
      if (typeof initialApi?.connect !== "function") {
        throw new Error("Wallet found but does not expose a connect() method.");
      }

      // ── Request connection ─────────────────────────────────────────────
      // connect() opens the wallet popup asking the user to approve the dApp.
      // The network ID must match the wallet's active network ("preprod" for testnet).
      const connected = await initialApi.connect("preprod");

      walletRef.current = connected as WalletConnectedAPI;
      setWallet(connected as WalletConnectedAPI);

      // ── Fetch shielded address ────────────────────────────────────────
      // Use shieldedAddress for display — it matches what the wallet shows
      // the user (Bech32m address), not the raw coin public key.
      try {
        const addresses = await connected.getShieldedAddresses();
        setShieldedPubkey(addresses.shieldedAddress ?? null);
      } catch {
        // Non-fatal: address is optional for some flows.
        console.warn("Could not fetch shielded address from wallet.");
      }

      setStatus("connected");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setStatus("error");
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
