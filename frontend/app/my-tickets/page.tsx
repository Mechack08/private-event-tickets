"use client";

import { Nav } from "@/components/Nav";
import { useMyTickets } from "@/hooks/useMyTickets";
import { ImportForm } from "./_components/ImportForm";
import { TicketCard } from "./_components/TicketCard";

// ─── Page shell ───────────────────────────────────────────────────────────────

export default function MyTicketsPage() {
  const {
    tickets,
    hydrated,
    showImport,
    setShowImport,
    refresh,
    importTicket,
    removeTicket,
  } = useMyTickets();

  if (!hydrated) return null;

  return (
    <>
      <Nav />
      <main className="min-h-dvh bg-[#080808] pt-14">
        <div className="mx-auto max-w-2xl px-5 pt-12 pb-24">
          <div className="flex items-start justify-between mb-8 gap-4">
            <div>
              <p className="text-[11px] text-zinc-500 uppercase tracking-widest font-medium mb-1.5">
                Attendee
              </p>
              <h1 className="text-2xl font-bold text-white tracking-tight">My Tickets</h1>
              <p className="text-sm text-zinc-500 mt-1">
                Your saved ticket secrets. Keep them private.
              </p>
            </div>
            <button
              onClick={() => setShowImport(!showImport)}
              className="shrink-0 text-xs font-semibold bg-white text-black px-3 py-2 hover:bg-zinc-100 transition-colors"
            >
              {showImport ? "Cancel" : "Import"}
            </button>
          </div>

          {showImport && (
            <ImportForm
              onImport={importTicket}
              onDone={() => setShowImport(false)}
            />
          )}

          {tickets.length === 0 ? (
            <div className="text-center py-20 border border-white/6 bg-white/[0.02]">
              <p className="text-xs text-zinc-600 text-center">No tickets saved yet.</p>
              <p className="text-zinc-700 text-xs mt-2">
                Claim a ticket on an event page, or import a secret above.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {tickets.map((ticket) => (
                <TicketCard
                  key={ticket.id}
                  ticket={ticket}
                  onRemove={removeTicket}
                  onRefresh={refresh}
                />
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
