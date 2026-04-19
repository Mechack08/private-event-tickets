/**
 * providers.ts — assembles the MidnightProviders bundle from a connected
 * Lace wallet and a network configuration.
 *
 * ⚠️  SSR WARNING
 * This file (and anything that imports it) MUST NOT be statically imported
 * in a Next.js page or client component.  @midnight-ntwrk/ledger-v8 (pulled
 * in transitively by several packages below) calls Node.js readFileSync at
 * module load time, which crashes the browser bundle.
 *
 * Always load this module with a dynamic import inside an async function:
 *
 *   async function handleConnect() {
 *     const { createEventTicketProviders } = await import("@/sdk/providers");
 *     // ...
 *   }
 */

import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { FetchZkConfigProvider } from "@midnight-ntwrk/midnight-js-fetch-zk-config-provider";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import { levelPrivateStateProvider } from "@midnight-ntwrk/midnight-js-level-private-state-provider";
import type { MidnightProviders } from "@midnight-ntwrk/midnight-js-types";
import type { WalletConnectedAPI } from "@midnight-ntwrk/dapp-connector-api";
import type { NetworkConfig } from "./types.js";

/** LevelDB namespace key — isolates private state per contract. */
const CONTRACT_NAME = "event-tickets";

/**
 * Build the full MidnightProviders object required by deployContract /
 * findDeployedContract.
 *
 * @param wallet  A connected WalletConnectedAPI obtained from the Lace DApp
 *                Connector (see hooks/useLaceWallet.ts).
 * @param config  Network endpoints — typically PREPROD_CONFIG from types.ts.
 */
export async function createEventTicketProviders(
  wallet: WalletConnectedAPI,
  config: NetworkConfig,
): Promise<MidnightProviders> {
  // Must be called before any provider that reads the active network ID.
  setNetworkId(config.networkId);

  // ── ZK configuration provider ─────────────────────────────────────────
  // Fetches compiled ZK artefacts (*.zkir, *.pk.bin, contract.wasm) that
  // were copied to /public/contracts/event-tickets/ during the build step.
  //
  // TODO: FetchZkConfigProvider constructor signature may differ in
  //       midnight-js-fetch-zk-config-provider@^4.0.4 — check the type
  //       definitions and adjust the second `fetch` argument if required.
  const zkConfigProvider = new FetchZkConfigProvider(
    `${typeof window !== "undefined" ? window.location.origin : ""}/contracts/${CONTRACT_NAME}`,
    (url: string, init?: RequestInit) =>
      typeof window !== "undefined"
        ? window.fetch(url, init)
        : fetch(url, init),
  );

  // ── Private state provider (LevelDB in the browser) ──────────────────
  // All private data (ticket secrets, nonces) is stored locally here and
  // never sent to any server.
  //
  // TODO: levelPrivateStateProvider may require an `openLevel` or similar
  //       async initialisation call in some SDK versions.  Check the type
  //       definitions and add `await` as needed.
  const privateStateProvider = levelPrivateStateProvider({
    contractName: CONTRACT_NAME,
  });

  // ── Public data provider (Midnight indexer GraphQL) ──────────────────
  const publicDataProvider = indexerPublicDataProvider(
    config.indexerUri,
    config.indexerWsUri,
  );

  // ── Wallet providers (signing + tx submission) ────────────────────────
  // The DApp Connector API exposes these via the connected wallet object.
  //
  // TODO: exact method names depend on dapp-connector-api@^4.0.1 — verify
  //       whether these are async factory methods or synchronous getters.
  const walletProvider   = await (wallet as any).walletProvider();
  const midnightProvider = await (wallet as any).midnightProvider();

  return {
    zkConfigProvider,
    privateStateProvider,
    publicDataProvider,
    walletProvider,
    midnightProvider,
  } as unknown as MidnightProviders;
}
