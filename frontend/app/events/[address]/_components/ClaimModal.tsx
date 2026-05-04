"use client";

import { useState } from "react";
import { motion } from "framer-motion";

interface ClaimModalProps {
  minAge: number;
  claiming: boolean;
  claimError: string | null;
  onSubmit: (dob: string) => void;
  onClose: () => void;
  onClearError: () => void;
}

/** DOB entry modal for the ZK age proof ticket claim flow. */
export function ClaimModal({
  minAge,
  claiming,
  claimError,
  onSubmit,
  onClose,
  onClearError,
}: ClaimModalProps) {
  const [dob, setDob] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (dob) onSubmit(dob);
  }

  const isWalletError = /no midnight wallet|no.*wallet detected/i.test(claimError ?? "");
  const isWalletOutdated = /does not support zk proving|getProvingProvider|midnight network/i.test(claimError ?? "");
  const isProofServer = /proof.*server|proof generation failed|403/i.test(claimError ?? "");

  const errorTitle = !claimError ? "" :
    isWalletError    ? "Wallet not found" :
    isWalletOutdated ? "Wallet update required" :
    isProofServer    ? "Proof server unreachable" :
    /sold.?out/i.test(claimError) ? "Sold out" :
    /at least \d+ years/i.test(claimError) ? `Must be ${minAge}+` :
    "Transaction failed";

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div className="w-full max-w-sm border border-white/10 bg-[#0d0d0d] overflow-hidden">
        <div className="px-5 py-4 border-b border-white/8">
          <p className="text-xs font-mono text-zinc-600 uppercase tracking-widest mb-1">ZK Age Proof</p>
          <h3 className="text-sm font-bold text-white">Enter your date of birth</h3>
        </div>

        {claimError ? (
          /* ── Error state ───────────────────────────────────────────── */
          <div className="px-5 py-7 flex flex-col items-center gap-5">
            <div className="relative flex items-center justify-center">
              <div className="absolute w-16 h-16 rounded-full bg-red-500/10 animate-ping opacity-30" />
              <div className="relative w-12 h-12 rounded-full bg-red-500/10 border border-red-500/25 flex items-center justify-center">
                <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                </svg>
              </div>
            </div>

            <div className="text-center space-y-2 px-2">
              <p className="text-sm font-semibold text-white">{errorTitle}</p>
              <p className="text-xs text-zinc-500 leading-relaxed">{claimError}</p>
            </div>

            {isProofServer && (
              <div className="w-full space-y-2">
                <p className="text-[11px] text-zinc-400 text-center leading-relaxed">
                  ZK proofs require a local proof server. Start it with Docker:
                </p>
                <code className="block text-[10px] text-zinc-300 bg-white/[0.05] border border-white/10 px-3 py-2 font-mono break-all">
                  docker run -d --rm -p 6300:6300 midnightntwrk/proof-server
                </code>
              </div>
            )}

            {(isWalletError || isWalletOutdated) && (
              <a
                href="https://www.lace.io"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] px-4 py-2.5 text-xs font-medium text-zinc-300 hover:text-white transition-colors"
              >
                <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                </svg>
                {isWalletOutdated ? "Update Lace ↗" : "Get Lace Wallet ↗"}
              </a>
            )}

            {isWalletOutdated && (
              <p className="text-[10px] text-zinc-600 text-center leading-relaxed">
                In Lace, go to Settings → Network → enable Midnight (Preprod)
              </p>
            )}

            <div className="flex gap-2 w-full pt-1">
              <button
                onClick={onClearError}
                className="flex-1 bg-white text-black text-sm font-semibold py-3 hover:bg-zinc-100 transition-colors"
              >
                Try again
              </button>
              <button
                onClick={() => { onClose(); onClearError(); }}
                className="px-5 text-sm text-zinc-500 border border-white/8 hover:text-white hover:border-white/20 transition-colors"
              >
                Dismiss
              </button>
            </div>
          </div>
        ) : (
          /* ── DOB form ──────────────────────────────────────────────── */
          <form onSubmit={handleSubmit} className="px-5 py-5 space-y-4">
            <p className="text-xs text-zinc-500 leading-relaxed">
              Your date of birth is never sent anywhere. A zero-knowledge proof is generated
              locally in your browser to prove
              {minAge > 0 ? ` you are ${minAge}+` : " your age"} without revealing the actual date.
            </p>
            <div>
              <label htmlFor="dobInput" className="block text-xs font-medium text-zinc-400 mb-2">
                Date of birth
              </label>
              <input
                id="dobInput"
                type="date"
                value={dob}
                onChange={(e) => setDob(e.target.value)}
                max={new Date().toISOString().split("T")[0]}
                required
                disabled={claiming}
                className="w-full bg-white/[0.03] border border-white/8 px-4 py-3 text-sm text-white focus:outline-none focus:border-white/25 disabled:opacity-40 transition-colors"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={claiming || !dob}
                className="flex-1 bg-white text-black text-sm font-semibold py-3 hover:bg-zinc-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                {claiming ? "Generating ZK proof…" : "Claim Ticket"}
              </button>
              <button
                type="button"
                onClick={() => { onClose(); onClearError(); }}
                disabled={claiming}
                className="px-5 text-sm text-zinc-500 border border-white/8 hover:text-white hover:border-white/20 disabled:opacity-30 transition-colors"
              >
                Cancel
              </button>
            </div>
            {claiming && (
              <p className="text-xs text-zinc-600 text-center">
                Generating proof and submitting transaction. This may take 2–4 min.
              </p>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
