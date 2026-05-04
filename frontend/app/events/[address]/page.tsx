"use client";

import { useParams } from "next/navigation";
import { Nav } from "@/components/Nav";
import { useEventAccess } from "@/hooks/useEventAccess";
import { EventHero } from "./_components/EventHero";
import { OrganizerView } from "./_components/OrganizerView";
import { AttendeeView } from "./_components/AttendeeView";
import { OrganizerKeyImport } from "./_components/OrganizerKeyImport";

// ─── Page shell ───────────────────────────────────────────────────────────────

export default function EventDetailPage() {
  const params = useParams();
  const address = decodeURIComponent(params.address as string);

  const {
    event,
    isOrganizer,
    hasLocalKey,
    organizerChecked,
    orgCheckError,
    onKeyImported,
    retry,
  } = useEventAccess(address);

  if (!organizerChecked) {
    return (
      <>
        <Nav />
        <main className="min-h-dvh bg-[#0a0a0a] pt-14">
          <div className="mx-auto max-w-2xl px-5 pt-12">
            <div className="h-8 w-48 bg-white/5 rounded animate-pulse mb-4" />
            <div className="h-4 w-72 bg-white/5 rounded animate-pulse" />
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <Nav />
      <main className="min-h-dvh bg-[#0a0a0a] pt-14">
        <div className="mx-auto max-w-2xl px-5 pt-6 pb-24">
          <EventHero address={address} event={event} isOrganizer={isOrganizer} />

          {isOrganizer && !hasLocalKey ? (
            <OrganizerKeyImport
              contractAddress={address}
              eventName={event?.eventName ?? ""}
              onImported={onKeyImported}
            />
          ) : isOrganizer ? (
            <OrganizerView address={address} event={event!} />
          ) : orgCheckError ? (
            <div className="border border-amber-500/25 bg-amber-500/[0.04] px-5 py-5 space-y-3">
              <p className="text-sm font-semibold text-amber-400">Could not verify organizer status</p>
              <p className="text-xs text-zinc-400 leading-relaxed">{orgCheckError}</p>
              <button
                className="text-xs text-zinc-500 hover:text-white underline underline-offset-2 transition-colors"
                onClick={retry}
              >
                Retry
              </button>
            </div>
          ) : (
            <AttendeeView address={address} event={event} />
          )}
        </div>
      </main>
    </>
  );
}
