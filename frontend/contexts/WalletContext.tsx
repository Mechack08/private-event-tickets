"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useWallet as useWalletHook, type UseWalletReturn } from "@/hooks/useWallet";

const WalletContext = createContext<UseWalletReturn | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const state = useWalletHook();
  return (
    <WalletContext.Provider value={state}>{children}</WalletContext.Provider>
  );
}

export function useWallet(): UseWalletReturn {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within WalletProvider");
  return ctx;
}

/** @deprecated Use WalletState */
export type { UseWalletReturn as LaceWalletState };
