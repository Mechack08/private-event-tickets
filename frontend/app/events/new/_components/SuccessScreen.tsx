"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { EventPlaceholder } from "@/components/EventPlaceholder";
import type { DeploySuccess, FormState } from "../types";
import { CheckSm } from "./icons";

export function SuccessScreen({
  result, form, onManage, onRetryBackend,
}: {
  result: DeploySuccess;
  form: FormState;
  onManage: () => void;
  onRetryBackend?: () => void;
}) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(result.contractAddress).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  }

  return (
    <motion.div key="success" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }} className="space-y-4">

      <div className="border border-white/8 bg-white/[0.025] p-7">
        <div className="flex items-center gap-3 mb-7">
          <div className="w-9 h-9 bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center shrink-0">
            <CheckSm />
          </div>
          <div>
            <p className="text-base font-semibold text-white">Event deployed</p>
            <p className="text-xs text-zinc-500 mt-0.5">Contract initialised on Midnight preprod.</p>
          </div>
        </div>

        <div className="mb-4 px-4 py-3 bg-white/[0.03] border border-white/6">
          <p className="text-[10px] font-medium text-zinc-600 uppercase tracking-widest mb-1.5">Event</p>
          <p className="text-sm font-semibold text-white">{result.eventName}</p>
        </div>

        <div className="mb-4 px-4 py-3 bg-white/[0.03] border border-white/6">
          <p className="text-[10px] font-medium text-zinc-600 uppercase tracking-widest mb-2">Contract address</p>
          <div className="flex items-start gap-2">
            <code className="text-[11px] font-mono text-zinc-300 flex-1 break-all leading-relaxed">
              {result.contractAddress}
            </code>
            <button onClick={copy}
              className="shrink-0 text-[11px] text-zinc-500 hover:text-white border border-white/8 hover:border-white/20 px-2.5 py-1.5 transition-colors mt-0.5">
              {copied ? "✓ Copied" : "Copy"}
            </button>
          </div>
        </div>

        <div className="mb-7 px-4 py-3.5 bg-emerald-500/[0.04] border border-emerald-500/20">
          <div className="flex items-start gap-2.5">
            <svg className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" fill="none"
              stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
            <div>
              <p className="text-sm font-semibold text-emerald-400">Organizer key saved</p>
              <p className="text-xs text-zinc-500 mt-0.5">
                Stored in <code className="font-mono text-[11px]">localStorage</code> — keep this browser to manage the event.
              </p>
            </div>
          </div>
        </div>

        {result.backendSyncFailed && (
          <div className="mb-4 px-4 py-3 bg-yellow-500/[0.06] border border-yellow-500/25 flex items-start gap-2.5">
            <svg className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" fill="none"
              stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-yellow-400">Event not yet in the public list</p>
              <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">
                The contract is live on-chain, but saving metadata to the backend failed.
                Your event is stored in this browser and visible in{" "}
                <Link href="/my-tickets" className="underline hover:text-zinc-400">My Tickets</Link>.
                {onRetryBackend && (
                  <button onClick={onRetryBackend}
                    className="ml-2 underline text-zinc-400 hover:text-white transition-colors">
                    Retry sync →
                  </button>
                )}
              </p>
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <button onClick={onManage}
            className="flex-1 bg-white text-black text-sm font-semibold py-3 hover:bg-zinc-100 transition-colors">
            Manage Event →
          </button>
          <Link href="/events"
            className="flex items-center border border-white/8 text-zinc-400 text-sm px-5 py-3 hover:text-white hover:border-white/20 transition-colors">
            All Events
          </Link>
        </div>
      </div>

      <div className="border border-amber-500/20 bg-amber-500/[0.03] px-4 py-3 flex items-start gap-2.5">
        <svg className="w-3.5 h-3.5 text-amber-500/70 mt-0.5 shrink-0" fill="none"
          stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
        </svg>
        <p className="text-xs text-zinc-600 leading-relaxed">
          Do not clear <code className="font-mono text-[11px] text-zinc-500">localStorage</code> without
          first exporting your organizer key from the event management page.
        </p>
      </div>

      <EventPlaceholder name={form.eventName} />
    </motion.div>
  );
}
