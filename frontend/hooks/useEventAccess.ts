"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  getEvent,
  getCallerSecret,
  type StoredEvent,
} from "@/lib/storage";
import { api } from "@/lib/api";

interface EventAccessState {
  event: StoredEvent | null;
  isOrganizer: boolean;
  hasLocalKey: boolean;
  organizerChecked: boolean;
  orgCheckError: string | null;
}

export interface UseEventAccessReturn extends EventAccessState {
  /** Call after an organizer key is successfully imported to unlock the dashboard. */
  onKeyImported: () => void;
  /** Re-run the organizer identity check (e.g. after a network error). */
  retry: () => void;
}

/**
 * Determines whether the current user is the event organizer, and whether
 * their ZK organizer key is present in localStorage.
 *
 * Fast path: if the event was created in this browser it reads from localStorage.
 * Slow path: queries the backend and compares hostId against the authenticated user.
 */
export function useEventAccess(address: string): UseEventAccessReturn {
  const { user, loading: authLoading } = useAuth();

  const [state, setState] = useState<EventAccessState>({
    event: null,
    isOrganizer: false,
    hasLocalKey: false,
    organizerChecked: false,
    orgCheckError: null,
  });
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (authLoading) return;

    setState((s) => ({ ...s, isOrganizer: false, orgCheckError: null }));

    // Fast path — event was created in this browser.
    const stored = getEvent(address);
    if (stored) {
      setState({
        event: stored,
        isOrganizer: true,
        hasLocalKey: !!getCallerSecret(address),
        organizerChecked: true,
        orgCheckError: null,
      });
      return;
    }

    // Slow path — query the backend.
    api.events
      .byAddress(address)
      .then((backendEvent) => {
        const event: StoredEvent = {
          contractAddress: backendEvent.contractAddress,
          eventName:       backendEvent.name,
          totalTickets:    backendEvent.maxCapacity ?? 0,
          txId:            "",
          createdAt:       backendEvent.createdAt,
          callerSecretHex: "",
          description:     backendEvent.description ?? "",
          location:        backendEvent.location ?? "",
          country:         backendEvent.country ?? undefined,
          city:            backendEvent.city ?? undefined,
          latitude:        backendEvent.latitude ?? undefined,
          longitude:       backendEvent.longitude ?? undefined,
          startDate:       backendEvent.startDate ?? new Date().toISOString(),
          endDate:         backendEvent.endDate ?? new Date().toISOString(),
          minAge:          backendEvent.minAge ?? 0,
          claimedCount:    backendEvent.claimedCount ?? 0,
        };

        const isOrganizer = !!(user && backendEvent.hostId === user.userId);

        setState({
          event,
          isOrganizer,
          hasLocalKey: isOrganizer ? !!getCallerSecret(address) : false,
          organizerChecked: true,
          orgCheckError: null,
        });
      })
      .catch((err: unknown) => {
        const status = (err as { status?: number }).status;
        const message =
          status === 404
            ? "This event has not been synced to the backend yet. Open the original browser where you created it and use the Sync button on the Events list to register it."
            : "Could not reach the backend to verify organizer status. Check that the server is running, then refresh.";

        setState((s) => ({ ...s, orgCheckError: message, organizerChecked: true }));
      });
  }, [address, user, authLoading, retryKey]);

  return {
    ...state,
    onKeyImported: () => setState((s) => ({ ...s, hasLocalKey: true })),
    retry: () => {
      setState((s) => ({ ...s, organizerChecked: false, orgCheckError: null }));
      setRetryKey((k) => k + 1);
    },
  };
}
