"use client";

export function KeyWarningPanel() {
  return (
    <div className="border border-amber-500/25 bg-amber-500/[0.04] p-5">
      <div className="flex items-start gap-3">
        <svg className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" fill="none"
          stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
        </svg>
        <div className="space-y-2">
          <p className="text-sm font-semibold text-amber-400">Organizer key</p>
          <p className="text-xs text-zinc-500 leading-relaxed">
            After deploy, <code className="text-zinc-400 font-mono text-[11px]">callerSecretHex</code> is
            saved automatically in this browser — the only preimage to the on-chain organizer hash.
          </p>
          <p className="text-xs text-zinc-600 leading-relaxed">
            <span className="text-zinc-500 font-medium">Losing it makes the event permanently
            unmanageable</span> — no issue, pause, cancel, or delegates are possible.
          </p>
        </div>
      </div>
    </div>
  );
}
