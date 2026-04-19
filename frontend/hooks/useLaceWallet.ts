/**
 * useLaceWallet.ts
 *
 * React hook for connecting to a Midnight-compatible wallet via the
 * DApp Connector API (window.midnight).
 *
 * Compatible wallets expose themselves as entries in window.midnight:
 *   window.midnight = { mnLace: InitialAPI, ... }
 *
 * The key name ("mnLace", "lace", etc.) is wallet-defined; we pick the
 * first available entry so the hook works with any Midnight wallet.
 *
 * The WalletConnectedAPI obtained after enable() is the object passed to
 * createEventTicketProviders() in the SDK.
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

export interface LaceWalletState {
  status: WalletStatus;
  wallet: WalletConnectedAPI | null;
  /** Hex-encoded shielded public key (available after connect). */
  shieldedPubkey: string | null;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
}

/** App identifier sent to the wallet during enable(). */
const APP_NAME = "private-event-tickets";

export function useLaceWallet(): LaceWalletState {
  const [status, setStatus] = useState<WalletStatus>("disconnected");
  const [wallet, setWallet] = useState<WalletConnectedAPI | null>(null);
  const [shieldedPubkey, setShieldedPubkey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Keep a stable ref to the connected wallet for teardown
  const walletRef = useRef<WalletConnectedAPI | null>(null);

  const connect = useCallback(async () => {
    setStatus("connecting");
    setError(null);

    try {
      // ── Detect wallet ──────────────────────────────────────────────────
      // window.midnight is a plain object dictionary; grab the first entry.
      const midnightObj = (window as unknown as { midnight?: Record<string, InitialAPI> }).midnight;
      if (!midnightObj || Object.keys(midnightObj).length === 0) {
        throw new Error(
          "No Midnight wallet detected. " +
            "Please install the Lace wallet extension and enable the Midnight network.",
        );
      }

      const initialApi = Object.values(midnightObj)[0] as InitialAPI & { enable?: (name: string) => Promise<WalletConnectedAPI> };
      if (typeof initialApi?.enable !== "function") {
        throw new Error("Wallet found but does not expose an enable() method.");
      }

      // ── Request connection ─────────────────────────────────────────────
      // enable() opens the wallet popup asking the user to approve the dApp.
      const connected = (await initialApi.enable(APP_NAME)) as WalletConnectedAPI;

      walletRef.current = connected;
      setWallet(connected);

      // ── Fetch shielded public key ──────────────────────────────────────
      // Used to pre-fill the holder pubkey field and for pubkeyToField().
      try {
        const addresses = await (connected as unknown as {
          getShieldedAddresses: () => Promise<{ shieldedCoinPublicKey: string }>;
        }).getShieldedAddresses();

        setShieldedPubkey(addresses.shieldedCoinPublicKey ?? null);
      } catch {
        // Non-fatal: pubkey is optional for some flows.
        console.warn("Could not fetch shielded public key from wallet.");
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

  return { status, wallet, shieldedPubkey, error, connect, disconnect };
}
