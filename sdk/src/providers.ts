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

import { setNetworkId, getNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { FetchZkConfigProvider } from "@midnight-ntwrk/midnight-js-fetch-zk-config-provider";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import { levelPrivateStateProvider } from "@midnight-ntwrk/midnight-js-level-private-state-provider";
import { createProofProvider } from "@midnight-ntwrk/midnight-js-types";
import type { MidnightProviders, WalletProvider, MidnightProvider, UnboundTransaction } from "@midnight-ntwrk/midnight-js-types";
import { toHex, fromHex, parseCoinPublicKeyToHex, parseEncPublicKeyToHex } from "@midnight-ntwrk/midnight-js-utils";
import type { WalletConnectedAPI, ConnectedAPI, KeyMaterialProvider } from "@midnight-ntwrk/dapp-connector-api";
import { Transaction } from "@midnight-ntwrk/ledger-v8";
import type { FinalizedTransaction } from "@midnight-ntwrk/ledger-v8";
import type { NetworkConfig } from "./types.js";

/** Contract namespace key used in ZK artifact URLs. */
const CONTRACT_NAME = "event-tickets";

/**
 * Build the full MidnightProviders object required by deployContract /
 * findDeployedContract.
 *
 * @param wallet  A connected WalletConnectedAPI obtained from the Lace DApp
 *                Connector (see hooks/useWallet.ts).
 * @param config  Network endpoints — typically PREPROD_CONFIG from types.ts.
 */
export async function createEventTicketProviders(
  wallet: WalletConnectedAPI,
  config: NetworkConfig,
): Promise<MidnightProviders> {
  // Must be called before any provider that reads the active network ID.
  setNetworkId(config.networkId);
  const networkId = getNetworkId();

  // ── ZK configuration provider ─────────────────────────────────────────
  // Fetches compiled ZK artefacts (*.prover, *.verifier, *.zkir) that
  // were copied to /public/contracts/event-tickets/ during the build step.
  const zkConfigProvider = new FetchZkConfigProvider<string>(
    `${typeof window !== "undefined" ? window.location.origin : ""}/contracts/${CONTRACT_NAME}`,
    (url: URL | RequestInfo, init?: RequestInit) =>
      typeof window !== "undefined"
        ? window.fetch(url, init)
        : fetch(url, init),
  );

  // ── Pre-fetch shielded key material ───────────────────────────────────
  // WalletProvider.getCoinPublicKey() and getEncryptionPublicKey() must be
  // synchronous, so we resolve the Bech32m values from the wallet now and
  // convert them to the hex-string format expected by ledger-v8.
  const { shieldedCoinPublicKey, shieldedEncryptionPublicKey, shieldedAddress } =
    await wallet.getShieldedAddresses();

  const coinPublicKey = parseCoinPublicKeyToHex(shieldedCoinPublicKey, networkId);
  const encPublicKey  = parseEncPublicKeyToHex(shieldedEncryptionPublicKey, networkId);

  // ── Private state provider (IndexedDB in the browser) ────────────────
  // All private data (ticket nonces) is stored locally here and never sent
  // to any server.  The accountId scopes storage to this wallet address so
  // different wallets using the same browser don't share state.
  const privateStateProvider = levelPrivateStateProvider({
    privateStoragePasswordProvider: () =>
      `midnight-${shieldedAddress.slice(0, 32)}`,
    accountId: shieldedAddress,
  });

  // ── Public data provider (Midnight indexer GraphQL) ──────────────────
  const publicDataProvider = indexerPublicDataProvider(
    config.indexerUri,
    config.indexerWsUri,
  );

  // ── Proof provider ────────────────────────────────────────────────────
  // Priority order:
  //   1. wallet.getProvingProvider()  — wallet-delegated (Lace v4+, ideal)
  //   2. Local Docker proof server via /api/proof proxy (localhost:6300)
  //
  // NOTE: wallet.getConfiguration().proverServerUri returns Lace's hosted
  // proof server, but it is auth-gated — direct calls return 403.  Only
  // Lace's own extension can call it.  We always fall back to Docker.

  const connectedApi = wallet as unknown as ConnectedAPI;
  if (typeof connectedApi.hintUsage === "function") {
    await connectedApi.hintUsage([
      "getProvingProvider",
      "balanceUnsealedTransaction",
      "submitTransaction",
    ]);
  }

  let proofProvider: ReturnType<typeof createProofProvider>;

  if (typeof (wallet as any).getProvingProvider === "function") {
    // ── Path A: wallet-delegated ZK proving (Lace v4+) ───────────────
    const provingProvider = await wallet.getProvingProvider(
      zkConfigProvider.asKeyMaterialProvider(),
    );
    proofProvider = createProofProvider(provingProvider);
  } else {
    // ── Path B: local Docker proof server via /api/proof CORS proxy ──
    // Lace's hosted proverServerUri requires their internal auth (returns
    // 403 when called by a dapp).  Use a local Docker container instead:
    //   docker run -d --rm -p 6300:6300 midnightntwrk/proof-server
    //
    // The /api/proof Next.js route forwards requests to localhost:6300
    // server-side, avoiding browser CORS restrictions.
    console.info(
      "[midnight] wallet.getProvingProvider not available — " +
      "using local Docker proof server via /api/proof proxy",
    );

    const { createProofServerProvingProvider } = await import("./proof-server-provider");
    const provingProvider = createProofServerProvingProvider(
      zkConfigProvider.asKeyMaterialProvider(),
      "/api/proof",   // proxy → localhost:6300 (no X-Proof-Server → uses default)
    );
    proofProvider = createProofProvider(provingProvider);
  }

  // ── Wallet provider (tx balancing + public key access) ────────────────
  // Bridges the dApp Connector's string-serialized tx API to the typed
  // UnboundTransaction / FinalizedTransaction objects the SDK uses.
  const walletProvider: WalletProvider = {
    balanceTx: async (tx: UnboundTransaction, _ttl?: Date): Promise<FinalizedTransaction> => {
      // Serialize the unbound (proved, pre-binding) transaction to hex.
      const serialized = toHex(tx.serialize());
      // Ask the wallet to add inputs/outputs and produce a balanced tx.
      const { tx: balancedHex } = await wallet.balanceUnsealedTransaction(serialized);
      // Deserialize the balanced result back into a typed FinalizedTransaction.
      return Transaction.deserialize(
        "signature",
        "proof",
        "binding",
        fromHex(balancedHex),
      ) as unknown as FinalizedTransaction;
    },
    getCoinPublicKey:        () => coinPublicKey as ReturnType<WalletProvider["getCoinPublicKey"]>,
    getEncryptionPublicKey:  () => encPublicKey  as ReturnType<WalletProvider["getEncryptionPublicKey"]>,
  };

  // ── Midnight provider (tx submission) ─────────────────────────────────
  // Bridges the dApp Connector's submitTransaction(hex) to the SDK's
  // submitTx(FinalizedTransaction) → TransactionId interface.
  const midnightProvider: MidnightProvider = {
    submitTx: async (tx: FinalizedTransaction) => {
      const [txId] = tx.identifiers();
      await wallet.submitTransaction(toHex(tx.serialize()));
      return txId;
    },
  };

  return {
    zkConfigProvider,
    privateStateProvider,
    publicDataProvider,
    proofProvider,
    walletProvider,
    midnightProvider,
  };
}
