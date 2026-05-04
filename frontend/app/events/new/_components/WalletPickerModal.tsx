"use client";

import type { AvailableWallet } from "@/hooks/useWallet";

export function WalletPickerModal({
  wallets, onPick, onCancel,
}: {
  wallets: AvailableWallet[];
  onPick: (key: string) => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-sm border border-white/10 bg-[#0f0f0f] p-6">
        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-1">Connect wallet</p>
        <h2 className="text-base font-bold text-white mb-5">Select a Midnight wallet</h2>
        <div className="space-y-2 mb-5">
          {wallets.map((w) => (
            <button
              key={w.key}
              onClick={() => onPick(w.key)}
              className="w-full flex items-center gap-3 border border-white/8 bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/20 px-4 py-3.5 text-left transition-colors"
            >
              {w.icon ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={w.icon} alt="" className="w-6 h-6 shrink-0 rounded" />
              ) : (
                <div className="w-6 h-6 shrink-0 bg-white/5 border border-white/10 flex items-center justify-center">
                  <svg className="w-3.5 h-3.5 text-zinc-600" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9" />
                  </svg>
                </div>
              )}
              <span className="text-sm font-medium text-white">{w.name}</span>
            </button>
          ))}
        </div>
        <button
          onClick={onCancel}
          className="w-full text-xs text-zinc-600 hover:text-zinc-400 transition-colors py-1"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
