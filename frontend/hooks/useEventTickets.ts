"use client";

import { useState, useEffect, useCallback } from "react";
import { api, type TicketRecord } from "@/lib/api";

interface UseEventTicketsReturn {
  tickets: TicketRecord[] | null;
  ticketsLoading: boolean;
  backendEventId: string | null;
  refresh: () => void;
}

/**
 * Fetches the list of tickets for a given event from the backend.
 * Re-fetches whenever `enabled` flips to true (e.g. tab becomes active).
 */
export function useEventTickets(
  contractAddress: string,
  enabled: boolean,
): UseEventTicketsReturn {
  const [tickets, setTickets] = useState<TicketRecord[] | null>(null);
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [backendEventId, setBackendEventId] = useState<string | null>(null);

  const refresh = useCallback(() => {
    if (!backendEventId) return;
    api.tickets.byEvent(backendEventId).then(setTickets).catch(() => {});
  }, [backendEventId]);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    setTicketsLoading(true);

    api.events
      .byAddress(contractAddress)
      .then((ev) => {
        if (cancelled) return;
        setBackendEventId(ev.id);
        return api.tickets.byEvent(ev.id);
      })
      .then((list) => {
        if (!cancelled && list) setTickets(list);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setTicketsLoading(false);
      });

    return () => { cancelled = true; };
  }, [contractAddress, enabled]);

  return { tickets, ticketsLoading, backendEventId, refresh };
}
