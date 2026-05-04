"use client";

import { useState, useEffect } from "react";

interface OnChainState {
  onChainMinAge: number;
  onChainIssued: number | null;
}

/**
 * Reads the public ledger state for an event contract (minAge, ticketsIssued).
 * Falls back to `fallbackMinAge` until the on-chain read resolves.
 */
export function useOnChainState(
  contractAddress: string,
  fallbackMinAge: number,
): OnChainState {
  const [onChainMinAge, setOnChainMinAge] = useState(fallbackMinAge);
  const [onChainIssued, setOnChainIssued] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    import("@sdk/contract-api")
      .then(({ readPublicState }) =>
        import("@sdk/types").then(({ PREPROD_CONFIG }) =>
          readPublicState(contractAddress, PREPROD_CONFIG).then((s) => {
            if (cancelled) return;
            setOnChainMinAge(Number(s.minAge));
            setOnChainIssued(Number(s.ticketsIssued));
          }),
        ),
      )
      .catch(() => {
        // Non-fatal — fallback values remain in place.
      });

    return () => { cancelled = true; };
  }, [contractAddress]);

  return { onChainMinAge, onChainIssued };
}
