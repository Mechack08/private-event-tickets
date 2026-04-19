"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useLaceWallet, type LaceWalletState } from "@/hooks/useLaceWallet";

const WalletContext = createContext<LaceWalletState | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const state = useLaceWallet();
  return (
    <WalletContext.Provider value={state}>{children}</WalletContext.Provider>
  );
}

export function useWallet(): LaceWalletState {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within WalletProvider");
  return ctx;
}
