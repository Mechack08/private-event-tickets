"use client";

import { useWallet } from "@/contexts/WalletContext";
import { getCallerSecret } from "@/lib/storage";

/**
 * Returns a factory function that builds the organizer EventTicketAPI instance.
 * The factory is created fresh per call so it always picks up the latest wallet state.
 *
 * Usage: const { build } = useOrganizerApi(address);
 *        const contractApi = await build();
 */
export function useOrganizerApi(contractAddress: string) {
  const { wallet, connect } = useWallet();

  async function build() {
    const liveWallet = wallet ?? (await connect());
    const secretHex = getCallerSecret(contractAddress);
    if (!secretHex) throw new Error("Organizer secret not found in this browser.");

    const [
      { createEventTicketProviders },
      { EventTicketAPI, hexToBigint },
      { PREPROD_CONFIG },
    ] = await Promise.all([
      import("@sdk/providers"),
      import("@sdk/contract-api"),
      import("@sdk/types"),
    ]);

    const providers = await createEventTicketProviders(liveWallet, PREPROD_CONFIG);
    return EventTicketAPI.join(providers, contractAddress, hexToBigint(secretHex));
  }

  return { build };
}
