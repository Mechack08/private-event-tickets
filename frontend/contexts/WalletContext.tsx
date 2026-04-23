"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useWallet as useWalletHook, type WalletState } from "@/hooks/useWallet";

const WalletContext = createContext<WalletState | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const state = useWalletHook();
  return (
    <WalletContext.Provider value={state}>{children}</WalletContext.Provider>
  );
}

export function useWallet(): WalletState {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within WalletProvider");
  return ctx;
}

/** @deprecated Use WalletState */
export type { WalletState as LaceWalletState };
