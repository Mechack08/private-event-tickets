"use client";

import { motion } from "framer-motion";
import type { TicketRecord } from "@/lib/api";
import type { StoredEvent } from "@/lib/storage";

interface AttendeesTabProps {
  event: StoredEvent;
  tickets: TicketRecord[] | null;
  ticketsLoading: boolean;
  onChainIssued: number | null;
}

/** Displays the stats grid (capacity / claimed / admitted), fill-rate bars, and ticket log. */
export function AttendeesTab({
  event,
  tickets,
  ticketsLoading,
  onChainIssued,
}: AttendeesTabProps) {
  const admittedCount = tickets?.filter((t) => t.isVerified).length ?? 0;
  const claimedCount  = tickets?.length ?? (event.claimedCount ?? 0);
  const issuedCount   = onChainIssued ?? claimedCount;
  const fillPct =
    event.totalTickets > 0 ? Math.min(100, (issuedCount / event.totalTickets) * 100) : 0;
  const admittedPct =
    event.totalTickets > 0 ? Math.min(100, (admittedCount / event.totalTickets) * 100) : 0;

  return (
    <div className="space-y-5">
      {/* Live counters */}
      <div className="grid grid-cols-3 border border-white/8 divide-x divide-white/8">
        {[
          { label: "CAPACITY", value: event.totalTickets, sub: "max seats" },
          { label: "CLAIMED",  value: issuedCount,        sub: "on-chain"  },
          { label: "ADMITTED", value: admittedCount,      sub: "scanned in" },
        ].map(({ label, value, sub }) => (
          <div key={label} className="px-4 py-4">
            <p className="text-[9px] font-mono font-semibold text-zinc-700 tracking-widest mb-2">{label}</p>
            <p className="text-2xl font-black text-white tabular-nums leading-none">{value}</p>
            <p className="text-[10px] font-mono text-zinc-600 mt-1">{sub}</p>
          </div>
        ))}
      </div>

      {/* Fill-rate bars */}
      {event.totalTickets > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[10px] font-mono text-zinc-600">
            <span>Ticket fill rate</span>
            <span>{fillPct.toFixed(2)}%</span>
          </div>
          <div className="h-1.5 bg-white/[0.04] overflow-hidden">
            <motion.div
              className="h-full bg-white/30"
              initial={{ width: 0 }}
              animate={{ width: `${fillPct}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
            />
          </div>
          {admittedCount > 0 && (
            <div className="h-1.5 bg-white/[0.04] overflow-hidden">
              <motion.div
                className="h-full bg-emerald-500/50"
                initial={{ width: 0 }}
                animate={{ width: `${admittedPct}%` }}
                transition={{ duration: 0.8, ease: "easeOut", delay: 0.1 }}
              />
            </div>
          )}
          <p className="text-[10px] font-mono text-zinc-700">
            <span className="text-white/30">■</span> Claimed &nbsp;
            <span className="text-emerald-500/50">■</span> Admitted
          </p>
        </div>
      )}

      {/* Ticket log */}
      <div>
        <p className="text-[9px] font-mono font-semibold text-zinc-700 tracking-widest uppercase mb-3">
          Ticket log
        </p>
        {ticketsLoading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-12 bg-white/[0.02] border border-white/6 animate-pulse" />
            ))}
          </div>
        ) : !tickets || tickets.length === 0 ? (
          <div className="border border-white/6 bg-white/[0.02] px-4 py-6 text-center">
            <p className="text-xs text-zinc-600">No tickets claimed yet</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {tickets.map((t) => (
              <div
                key={t.id}
                className={`border px-4 py-3 flex items-center gap-3 ${
                  t.isVerified
                    ? "border-amber-500/15 bg-amber-500/[0.03]"
                    : "border-white/6 bg-white/[0.02]"
                }`}
              >
                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                  t.isVerified ? "bg-amber-400/70" : "bg-white/20"
                }`} />
                <p className="text-[10px] font-mono text-zinc-500 flex-1 truncate">{t.claimTxId}</p>
                <span className={`text-[9px] font-mono font-semibold border px-1.5 py-0.5 ${
                  t.isVerified
                    ? "text-amber-400 border-amber-500/25"
                    : "text-zinc-600 border-white/10"
                }`}>
                  {t.isVerified ? "ADMITTED" : "CLAIMED"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
