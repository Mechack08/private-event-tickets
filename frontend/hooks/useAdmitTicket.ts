"use client";

import { useState } from "react";
import { useOrganizerApi } from "@/hooks/useOrganizerApi";
import { api } from "@/lib/api";

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 4_000;

export interface AdmitRetry {
  attempt: number;
  max: number;
}

export interface AdmitTicketState {
  admitting: boolean;
  admitRetry: AdmitRetry | null;
  admitResult: "success" | "error" | null;
  admitError: string | null;
  lastAdmittedAt: Date | null;
  lastAdmittedNonce: string | null;
  admittedNonces: Set<string>;
  pendingNonce: string | null;
  pendingClaimTxId: string | null;
  scanActive: boolean;
  cameraPermissionDenied: boolean;
}

export interface UseAdmitTicketReturn {
  state: AdmitTicketState;
  submitAdmit: (rawNonce: string, claimTxId?: string | null) => Promise<void>;
  /** Returns true when a valid ticket QR is parsed and sets pendingNonce. */
  handleQrScan: (raw: string) => boolean;
  resetAdmit: (resumeScan?: boolean) => void;
  setScanActive: (active: boolean) => void;
  setAdmitMode: (mode: "scan" | "manual") => void;
  setCameraPermissionDenied: (denied: boolean) => void;
}

/**
 * Manages the full ticket admission flow:
 *  - QR scan / manual nonce input
 *  - submitAdmit with up to 3 retries on wallet timeout
 *  - Backend ticket record update after on-chain success
 *  - Session-local set of already-admitted nonces
 */
export function useAdmitTicket(
  contractAddress: string,
  backendEventId: string | null,
  onTicketsRefresh: () => void,
): UseAdmitTicketReturn {
  const { build } = useOrganizerApi(contractAddress);

  const [state, setState] = useState<AdmitTicketState>({
    admitting: false,
    admitRetry: null,
    admitResult: null,
    admitError: null,
    lastAdmittedAt: null,
    lastAdmittedNonce: null,
    admittedNonces: new Set(),
    pendingNonce: null,
    pendingClaimTxId: null,
    scanActive: false,
    cameraPermissionDenied: false,
  });

  function patch(partial: Partial<AdmitTicketState>) {
    setState((s) => ({ ...s, ...partial }));
  }

  async function submitAdmit(rawNonce: string, claimTxId?: string | null) {
    const trimmed = rawNonce.trim();
    if (!trimmed || state.admitting) return;

    patch({
      admitting: true,
      admitResult: null,
      admitError: null,
      admitRetry: null,
      scanActive: false,
    });

    let lastErr: unknown;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const contractApi = await build();
        const { hexToBigint } = await import("@sdk/contract-api");
        const nonce = hexToBigint(trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`);
        await contractApi.admitTicket(nonce);

        const now = new Date();
        setState((s) => ({
          ...s,
          admitting: false,
          admitRetry: null,
          admitResult: "success",
          lastAdmittedAt: now,
          lastAdmittedNonce: trimmed,
          admittedNonces: new Set([...s.admittedNonces, trimmed]),
          pendingNonce: null,
          pendingClaimTxId: null,
        }));

        // Non-fatal backend sync — on-chain tx already succeeded.
        if (claimTxId) {
          api.tickets.admit(claimTxId).catch(() => {});
        }
        onTicketsRefresh();
        return;
      } catch (err) {
        lastErr = err;
        const msg = err instanceof Error ? err.message : String(err);
        const isTimeout = /timed out|timeout/i.test(msg);
        // Only retry on transient wallet timeout; fail fast for contract logic errors.
        if (!isTimeout || attempt === MAX_RETRIES) break;
        patch({ admitRetry: { attempt, max: MAX_RETRIES } });
        await new Promise<void>((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      }
    }

    patch({
      admitting: false,
      admitRetry: null,
      admitResult: "error",
      admitError: lastErr instanceof Error ? lastErr.message : String(lastErr),
    });
  }

  function handleQrScan(raw: string): boolean {
    try {
      const parsed = JSON.parse(raw) as {
        contractAddress?: string;
        nonce?: string;
        claimTxId?: string;
      };
      if (
        typeof parsed.contractAddress === "string" &&
        typeof parsed.nonce === "string" &&
        parsed.nonce.startsWith("0x")
      ) {
        patch({
          scanActive: false,
          pendingNonce: parsed.nonce,
          pendingClaimTxId: typeof parsed.claimTxId === "string" ? parsed.claimTxId : null,
        });
        return true;
      }
    } catch {
      // Not JSON — keep scanning.
    }
    return false;
  }

  function resetAdmit(resumeScan = false) {
    patch({
      admitResult: null,
      admitError: null,
      pendingNonce: null,
      pendingClaimTxId: null,
      scanActive: resumeScan,
    });
  }

  function setAdmitMode(mode: "scan" | "manual") {
    patch({
      scanActive: mode === "scan",
      cameraPermissionDenied: mode === "scan" ? false : state.cameraPermissionDenied,
    });
  }

  return {
    state,
    submitAdmit,
    handleQrScan,
    resetAdmit,
    setScanActive: (active) => patch({ scanActive: active }),
    setAdmitMode,
    setCameraPermissionDenied: (denied) => patch({ cameraPermissionDenied: denied }),
  };
}
