"use client";

import { useState } from "react";
import { useOrganizerApi } from "@/hooks/useOrganizerApi";

export type EventStatus = "active" | "paused" | "cancelled";

interface UseEventStatusReturn {
  eventStatus: EventStatus;
  statusLoading: boolean;
  statusError: string | null;
  changeStatus: (action: "pause" | "resume" | "cancel") => Promise<void>;
}

/** Manages event lifecycle (pause / resume / cancel) via the organizer contract API. */
export function useEventStatus(contractAddress: string): UseEventStatusReturn {
  const { build } = useOrganizerApi(contractAddress);

  const [eventStatus, setEventStatus] = useState<EventStatus>("active");
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  async function changeStatus(action: "pause" | "resume" | "cancel") {
    setStatusLoading(true);
    setStatusError(null);
    try {
      const contractApi = await build();
      if (action === "pause")  await contractApi.pauseEvent();
      if (action === "resume") await contractApi.resumeEvent();
      if (action === "cancel") await contractApi.cancelEvent();
      setEventStatus(
        action === "cancel" ? "cancelled" : action === "pause" ? "paused" : "active",
      );
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : String(err));
    } finally {
      setStatusLoading(false);
    }
  }

  return { eventStatus, statusLoading, statusError, changeStatus };
}
