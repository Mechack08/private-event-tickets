"use client";

import { useState, useEffect } from "react";
import {
  getMyTickets,
  saveTicket,
  removeTicket,
  markTicketUsed,
  type SavedTicket,
} from "@/lib/storage";
import { api } from "@/lib/api";

interface UseMyTicketsReturn {
  tickets: SavedTicket[];
  hydrated: boolean;
  showImport: boolean;
  setShowImport: (show: boolean) => void;
  refresh: () => void;
  /** Returns a validation error string, or null on success. */
  importTicket: (json: string, eventName: string) => string | null;
  removeTicket: (id: string) => void;
}

/**
 * Manages the ticket wallet:
 *  - Hydrates from localStorage on mount
 *  - Silently syncs admission status from the backend on first hydration
 */
export function useMyTickets(): UseMyTicketsReturn {
  const [tickets, setTickets] = useState<SavedTicket[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [showImport, setShowImport] = useState(false);

  function refresh() {
    setTickets(getMyTickets());
  }

  // Hydrate from localStorage.
  useEffect(() => {
    refresh();
    setHydrated(true);
  }, []);

  // Silent admission sync — mark any locally-stored ticket as admitted
  // if the backend says it has been verified.
  useEffect(() => {
    if (!hydrated) return;

    api.tickets
      .mine()
      .then((backendTickets) => {
        let changed = false;
        for (const bt of backendTickets) {
          if (!bt.isVerified) continue;
          const local = getMyTickets().find((t) => t.claimTxId === bt.claimTxId);
          if (local && !local.isUsed) {
            markTicketUsed(local.id, bt.verifiedAt ?? undefined);
            changed = true;
          }
        }
        if (changed) refresh();
      })
      .catch(() => {});
  }, [hydrated]);

  function importTicket(json: string, eventName: string): string | null {
    try {
      const parsed = JSON.parse(json) as Record<string, unknown>;
      if (
        typeof parsed.contractAddress !== "string" ||
        typeof parsed.nonce !== "string"
      ) {
        return "Must have contractAddress and nonce fields.";
      }
      saveTicket({
        id: crypto.randomUUID(),
        contractAddress: parsed.contractAddress,
        eventName: eventName.trim() || parsed.contractAddress,
        secret: { contractAddress: parsed.contractAddress, nonce: parsed.nonce },
        receivedAt: new Date().toISOString(),
      });
      refresh();
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : "Invalid JSON format.";
    }
  }

  function remove(id: string) {
    removeTicket(id);
    refresh();
  }

  return {
    tickets,
    hydrated,
    showImport,
    setShowImport,
    refresh,
    importTicket,
    removeTicket: remove,
  };
}
