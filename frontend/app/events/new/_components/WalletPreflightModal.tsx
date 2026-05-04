"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { PreflightState } from "../types";
import { formatDust, DEPLOY_COST_ESTIMATE } from "../constants";
import { Spinner } from "./icons";

export function WalletPreflightModal({
  state, onConfirm, onCancel,
}: {
  state: PreflightState;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const hasBalance = state.dustBalance !== null;
  const sufficient = !hasBalance || state.dustBalance! >= DEPLOY_COST_ESTIMATE;
  // Bar fills to 100% when balance = 3× estimated cost.
  const pct = hasBalance
    ? Math.min(100, Number((state.dustBalance! * 100n) / (DEPLOY_COST_ESTIMATE * 3n)))
    : 0;
  const barColor = pct > 66 ? "bg-emerald-500" : pct > 33 ? "bg-amber-500" : "bg-red-500";
  const truncAddr = state.dustAddress
    ? state.dustAddress.slice(0, 14) + "…" + state.dustAddress.slice(-8)
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div className="w-full max-w-sm border border-white/10 bg-[#0d0d0d] overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-white/8">
          {state.walletIcon ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={state.walletIcon} alt="" className="w-9 h-9 shrink-0 rounded-lg" />
          ) : (
            <div className="w-9 h-9 shrink-0 border border-white/10 bg-white/[0.04] flex items-center justify-center">
              <svg className="w-4.5 h-4.5 text-zinc-500" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6" />
              </svg>
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-[9px] font-mono font-semibold text-zinc-700 uppercase tracking-widest">Wallet</p>
            <p className="text-sm font-semibold text-white truncate">{state.walletName}</p>
          </div>
          {state.phase === "connecting" && (
            <span className="shrink-0 flex items-center gap-1.5 text-[10px] font-mono text-zinc-500">
              <Spinner size={11} /> Connecting
            </span>
          )}
          {state.phase === "ready" && (
            <span className="shrink-0 flex items-center gap-1.5 text-[10px] font-mono text-emerald-400 border border-emerald-500/20 bg-emerald-500/[0.04] px-2 py-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Connected
            </span>
          )}
          {state.phase === "error" && (
            <span className="shrink-0 text-[10px] font-mono text-red-400">Failed</span>
          )}
        </div>

        <div className="px-5 py-5">
          {/* Connecting phase */}
          {state.phase === "connecting" && (
            <div className="py-6 text-center space-y-4">
              <div className="inline-flex w-14 h-14 border border-white/8 bg-white/[0.02] items-center justify-center mx-auto">
                <Spinner size={22} />
              </div>
              <div>
                <p className="text-sm font-medium text-zinc-200 mb-1">Awaiting wallet approval</p>
                <p className="text-xs text-zinc-600 leading-relaxed">
                  The wallet extension popup may be waiting behind this window. Check your browser toolbar.
                </p>
              </div>
            </div>
          )}

          {/* Error phase */}
          {state.phase === "error" && (
            <div className="flex items-start gap-3 border border-red-500/20 bg-red-500/[0.04] px-4 py-3">
              <svg className="w-4 h-4 text-red-400 mt-0.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
              <p className="text-xs text-zinc-400 leading-relaxed">{state.error}</p>
            </div>
          )}

          {/* Ready phase */}
          {state.phase === "ready" && (
            <div className="space-y-4">
              {truncAddr && (
                <div>
                  <p className="text-[9px] font-mono font-semibold text-zinc-700 uppercase tracking-widest mb-1.5">Shielded address</p>
                  <p className="text-[11px] font-mono text-zinc-400 bg-white/[0.03] border border-white/6 px-3 py-2 truncate">
                    {truncAddr}
                  </p>
                </div>
              )}

              <div>
                <div className="flex items-baseline justify-between mb-1.5">
                  <p className="text-[9px] font-mono font-semibold text-zinc-700 uppercase tracking-widest">DUST Balance</p>
                  {hasBalance ? (
                    <p className="text-sm font-bold text-white tabular-nums">
                      {formatDust(state.dustBalance!)}
                      <span className="text-[10px] font-mono text-zinc-600 ml-1">DUST</span>
                    </p>
                  ) : (
                    <p className="text-xs text-zinc-600">unavailable</p>
                  )}
                </div>
                <div className="h-1 bg-white/[0.04] border border-white/6 mb-1 overflow-hidden">
                  <div className={`h-full transition-all duration-700 ease-out ${barColor}`} style={{ width: `${pct}%` }} />
                </div>
                {state.dustCap !== null && (
                  <p className="text-[9px] font-mono text-zinc-800">Cap: {formatDust(state.dustCap!)} DUST</p>
                )}
              </div>

              <div className="border border-white/6 bg-white/[0.015] divide-y divide-white/6">
                <div className="flex items-center justify-between px-4 py-2.5">
                  <p className="text-xs text-zinc-500">Estimated deploy cost</p>
                  <p className="text-xs font-mono text-zinc-400">~{formatDust(DEPLOY_COST_ESTIMATE)} DUST</p>
                </div>
                <div className="flex items-center justify-between px-4 py-2.5">
                  <p className="text-xs text-zinc-500">Status</p>
                  {!hasBalance ? (
                    <span className="text-[10px] font-mono text-zinc-600">—</span>
                  ) : sufficient ? (
                    <span className="flex items-center gap-1 text-[10px] font-mono text-emerald-400">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      Sufficient
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[10px] font-mono text-amber-400">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                      </svg>
                      Low balance
                    </span>
                  )}
                </div>
              </div>

              {!sufficient && hasBalance && (
                <p className="flex items-start gap-2 text-[11px] text-amber-300/60 bg-amber-500/[0.04] border border-amber-500/15 px-3 py-2.5 leading-relaxed">
                  <svg className="w-3.5 h-3.5 mt-0.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                  </svg>
                  Balance may be too low. The transaction might fail. Earn more DUST from NIGHT staking before proceeding.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-5 pb-5">
          {state.phase === "ready" && (
            <motion.button
              onClick={onConfirm}
              whileTap={{ scale: 0.98 }}
              className="flex-1 bg-white text-black text-sm font-semibold py-3 hover:bg-zinc-100 transition-colors"
            >
              Deploy Contract →
            </motion.button>
          )}
          <button
            onClick={onCancel}
            className={cn(
              "text-sm text-zinc-500 hover:text-white border border-white/8 hover:border-white/20 py-3 transition-colors",
              state.phase === "ready" ? "px-5" : "flex-1",
            )}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
