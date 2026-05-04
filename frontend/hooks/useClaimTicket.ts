"use client";

import { useState } from "react";
import { useWallet } from "@/contexts/WalletContext";
import { saveTicket, type SavedTicket } from "@/lib/storage";
import { api } from "@/lib/api";
import { parseContractError } from "@/lib/utils/errors";

interface UseClaimTicketReturn {
  claiming: boolean;
  claimError: string | null;
  /** Returns the saved ticket on success, null on failure. */
  handleClaim: (dob: string) => Promise<SavedTicket | null>;
  clearError: () => void;
}

/**
 * Manages the attendee ticket-claim flow:
 *  - Client-side age pre-check before hitting the contract
 *  - ZK proof generation via the Midnight SDK
 *  - Saves ticket to localStorage and syncs to backend (non-fatal)
 */
export function useClaimTicket(
  contractAddress: string,
  minAge: number,
  eventName: string,
): UseClaimTicketReturn {
  const { wallet, connect } = useWallet();
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);

  async function handleClaim(dob: string): Promise<SavedTicket | null> {
    if (!dob) return null;

    // Client-side age gate — gives immediate feedback without burning a ZK proof.
    if (minAge > 0) {
      const birthYear = new Date(dob).getFullYear();
      const age = new Date().getFullYear() - birthYear;
      if (age < minAge) {
        setClaimError(
          `You must be at least ${minAge} years old. Based on the year entered, you are ${age}.`,
        );
        return null;
      }
    }

    setClaiming(true);
    setClaimError(null);

    try {
      const liveWallet = wallet ?? (await connect());
      const birthYear = new Date(dob).getFullYear();

      const [
        { createEventTicketProviders },
        { EventTicketAPI },
        { PREPROD_CONFIG },
      ] = await Promise.all([
        import("@sdk/providers"),
        import("@sdk/contract-api"),
        import("@sdk/types"),
      ]);

      const providers = await createEventTicketProviders(liveWallet, PREPROD_CONFIG);
      const contractApi = await EventTicketAPI.joinAsAttendee(providers, contractAddress);
      const { nonce, txId } = await contractApi.claimTicket(birthYear);
      const secret = contractApi.ticketSecret(nonce);

      const ticket: SavedTicket = {
        id: crypto.randomUUID(),
        contractAddress,
        eventName,
        claimTxId: txId,
        secret,
        receivedAt: new Date().toISOString(),
      };
      saveTicket(ticket);

      // Non-fatal backend sync — ticket is already secured on-chain and in localStorage.
      try {
        const backendEvent = await api.events.byAddress(contractAddress);
        await api.tickets.issue({ claimTxId: txId, eventId: backendEvent.id });
      } catch {
        console.warn("[ticket] Backend sync failed — ticket is on-chain but not in DB.");
      }

      return ticket;
    } catch (err) {
      setClaimError(parseContractError(err, minAge));
      return null;
    } finally {
      setClaiming(false);
    }
  }

  return { claiming, claimError, handleClaim, clearError: () => setClaimError(null) };
}
