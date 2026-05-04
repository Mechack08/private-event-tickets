"use client";

import { useState } from "react";
import { AdmitPanel } from "./AdmitPanel";
import { AttendeesTab } from "./AttendeesTab";
import { OrganizerKeyExport } from "./OrganizerKeyExport";
import { ShareHint } from "./ShareHint";
import { useEventStatus } from "@/hooks/useEventStatus";
import { useAdmitTicket } from "@/hooks/useAdmitTicket";
import { useEventTickets } from "@/hooks/useEventTickets";
import { useOnChainState } from "@/hooks/useOnChainState";
import type { StoredEvent } from "@/lib/storage";

interface OrganizerViewProps {
  address: string;
  event: StoredEvent;
}

type Tab = "admit" | "stats" | "info";

/** Organizer dashboard: status controls, tabs, and all sub-panel components. */
export function OrganizerView({ address, event }: OrganizerViewProps) {
  const [tab, setTab] = useState<Tab>("admit");

  const { eventStatus, statusLoading, statusError, changeStatus } = useEventStatus(address);
  const { onChainMinAge, onChainIssued } = useOnChainState(address, event.minAge ?? 0);

  const ticketsEnabled = tab === "stats" || tab === "admit";
  const { tickets, ticketsLoading, backendEventId, refresh: refreshTickets } = useEventTickets(
    address,
    ticketsEnabled,
  );

  const admit = useAdmitTicket(address, backendEventId, refreshTickets);

  const isCancelled = eventStatus === "cancelled";

  async function handleChangeStatus(action: "pause" | "resume" | "cancel") {
    if (action === "cancel") {
      if (!confirm("Cancel this event permanently? This cannot be undone.")) return;
    }
    await changeStatus(action);
  }

  return (
    <div>
      {/* ── Status controls ──────────────────────────────────────────── */}
      <div className="flex items-center gap-2 mb-6 flex-wrap">
        <span className={`text-xs border px-2.5 py-1 ${
          isCancelled         ? "border-red-500/30    text-red-400"
          : eventStatus === "paused" ? "border-yellow-500/30 text-yellow-400"
          :                            "border-emerald-500/30 text-emerald-400"
        }`}>
          {isCancelled ? "Cancelled" : eventStatus === "paused" ? "Paused" : "Active"}
        </span>

        {!isCancelled && (
          <>
            {eventStatus === "active" ? (
              <button
                onClick={() => handleChangeStatus("pause")}
                disabled={statusLoading}
                className="text-xs text-zinc-400 hover:text-yellow-400 border border-white/8 hover:border-yellow-500/30 px-2.5 py-1 transition-colors disabled:opacity-30"
              >
                {statusLoading ? "…" : "Pause"}
              </button>
            ) : (
              <button
                onClick={() => handleChangeStatus("resume")}
                disabled={statusLoading}
                className="text-xs text-zinc-400 hover:text-emerald-400 border border-white/8 hover:border-emerald-500/30 px-2.5 py-1 transition-colors disabled:opacity-30"
              >
                {statusLoading ? "…" : "Resume"}
              </button>
            )}
            <button
              onClick={() => handleChangeStatus("cancel")}
              disabled={statusLoading}
              className="text-xs text-zinc-600 hover:text-red-400 border border-white/8 hover:border-red-500/30 px-2.5 py-1 transition-colors disabled:opacity-30"
            >
              Cancel event
            </button>
          </>
        )}
      </div>

      {statusError && (
        <div className="border border-red-500/20 bg-red-500/[0.04] px-4 py-4 mb-4">
          <p className="text-sm font-medium text-red-400 mb-1">Error</p>
          <p className="text-xs text-red-300/70 break-all">{statusError}</p>
        </div>
      )}

      <OrganizerKeyExport contractAddress={address} eventName={event.eventName} />

      {/* ── Tabs ─────────────────────────────────────────────────────── */}
      <div className="flex gap-0 border-b border-white/8 mb-6">
        {(["admit", "stats", "info"] as const).map((id) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-4 py-2.5 text-xs font-medium -mb-px border-b-2 transition-colors tracking-wide uppercase ${
              tab === id
                ? "border-white text-white"
                : "border-transparent text-zinc-600 hover:text-zinc-300"
            }`}
          >
            {id === "admit" ? "Admit" : id === "stats" ? "Attendees" : "Event Info"}
          </button>
        ))}
      </div>

      {/* ── Tab: Admit ───────────────────────────────────────────────── */}
      {tab === "admit" && (
        <AdmitPanel isCancelled={isCancelled} admit={admit} />
      )}

      {/* ── Tab: Attendees / Stats ───────────────────────────────────── */}
      {tab === "stats" && (
        <AttendeesTab
          event={event}
          tickets={tickets}
          ticketsLoading={ticketsLoading}
          onChainIssued={onChainIssued}
        />
      )}

      {/* ── Tab: Event Info ──────────────────────────────────────────── */}
      {tab === "info" && (
        <div className="space-y-4">
          <div className="border border-white/8 divide-y divide-white/6">
            <div className="flex items-center justify-between px-4 py-3">
              <p className="text-xs text-zinc-500">Total capacity</p>
              <p className="text-sm font-mono text-white">{event.totalTickets}</p>
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <p className="text-xs text-zinc-500">Min age</p>
              <div className="text-right">
                <p className="text-sm font-mono text-white">
                  {onChainMinAge > 0 ? `${onChainMinAge}+` : "No restriction"}
                </p>
                <p className="text-[10px] font-mono text-zinc-700 mt-0.5">from chain</p>
              </div>
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <p className="text-xs text-zinc-500">Tickets issued on-chain</p>
              <p className="text-sm font-mono text-white">
                {onChainIssued !== null ? onChainIssued : "—"}
              </p>
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <p className="text-xs text-zinc-500">Contract</p>
              <p className="text-xs font-mono text-zinc-400 truncate max-w-[180px]">{address}</p>
            </div>
          </div>
          <ShareHint address={address} />
        </div>
      )}
    </div>
  );
}
