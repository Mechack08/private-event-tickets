/**
 * proof-server-provider.ts
 *
 * Implements the `ProvingProvider` interface (from @midnight-ntwrk/ledger-v8)
 * using a Midnight proof server as the backend.  The proof server may be:
 *
 *   • Lace's hosted Preprod server — URI returned by wallet.getConfiguration()
 *     e.g. "https://proof-server.midnight.network"
 *   • A local Docker container — http://localhost:6300
 *     docker run -d --rm -p 6300:6300 midnightntwrk/proof-server
 *   • The Next.js CORS proxy at "/api/proof" (used as a fallback when the
 *     proof server is on localhost and cannot be called directly from the
 *     browser due to CORS restrictions)
 *
 * Binary protocol (per @midnight-ntwrk/ledger-v8):
 *   prove:  POST <base>/prove   Content-Type: application/octet-stream
 *           body    = createProvingPayload(preimage, bindingInput, keyMaterial)
 *           response = raw proof bytes (Uint8Array)
 *
 *   check:  POST <base>/check   Content-Type: application/octet-stream
 *           body    = createCheckPayload(preimage, ir)
 *           response = binary result parsed by parseCheckResult()
 */

import {
  createProvingPayload,
  createCheckPayload,
  parseCheckResult,
} from "@midnight-ntwrk/ledger-v8";
import type { ProvingProvider } from "@midnight-ntwrk/ledger-v8";
import type { KeyMaterialProvider } from "@midnight-ntwrk/midnight-js-types";

/**
 * Creates a `ProvingProvider` that proxies proof generation through the
 * Next.js API routes (/api/proof/prove and /api/proof/check), which forward
 * to the real proof server without CORS restrictions.
 *
 * @param keyMaterialProvider  Supplies prover keys, verifier keys, and ZKIR
 *                             for each circuit — from `zkConfigProvider.asKeyMaterialProvider()`.
 * @param proxyBase            The Next.js proxy base path (always "/api/proof").
 * @param realServerUri        The actual proof server URL (from wallet.getConfiguration()
 *                             or http://localhost:6300). Sent to the proxy via
 *                             X-Proof-Server header so it can forward correctly.
 */
export function createProofServerProvingProvider(
  keyMaterialProvider: KeyMaterialProvider,
  proxyBase: string,
  realServerUri?: string,
): ProvingProvider {
  const base = proxyBase.replace(/\/$/, "");
  const extraHeaders: Record<string, string> = realServerUri
    ? { "X-Proof-Server": realServerUri }
    : {};

  return {
    async check(
      serializedPreimage: Uint8Array,
      keyLocation: string,
    ): Promise<(bigint | undefined)[]> {
      const ir = await keyMaterialProvider.getZKIR(keyLocation);
      const payload = createCheckPayload(serializedPreimage, ir);

      const res = await fetch(`${base}/check`, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream", ...extraHeaders },
        body: payload.buffer as ArrayBuffer,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => `HTTP ${res.status}`);
        if (res.status === 403) {
          throw new Error(
            "Proof server rejected the request (403 Forbidden). " +
            "Lace's hosted proof server requires internal auth — use a local Docker server instead.\n" +
            "To start: docker run -d --rm -p 6300:6300 midnightntwrk/proof-server\n" +
            `Detail: ${text}`,
          );
        }
        throw new Error(`Proof server check failed [${res.status}]: ${text}`);
      }

      const resultBytes = new Uint8Array(await res.arrayBuffer());
      return parseCheckResult(resultBytes);
    },

    async prove(
      serializedPreimage: Uint8Array,
      keyLocation: string,
      overwriteBindingInput?: bigint,
    ): Promise<Uint8Array> {
      const [proverKey, verifierKey, ir] = await Promise.all([
        keyMaterialProvider.getProverKey(keyLocation),
        keyMaterialProvider.getVerifierKey(keyLocation),
        keyMaterialProvider.getZKIR(keyLocation),
      ]);

      const payload = createProvingPayload(
        serializedPreimage,
        overwriteBindingInput,
        { proverKey, verifierKey, ir },
      );

      const res = await fetch(`${base}/prove`, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream", ...extraHeaders },
        body: payload.buffer as ArrayBuffer,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => `HTTP ${res.status}`);

        if (res.status === 403) {
          throw new Error(
            "Proof server rejected the request (403 Forbidden). " +
            "Lace's hosted proof server requires internal auth — use a local Docker server instead.\n" +
            "To start: docker run -d --rm -p 6300:6300 midnightntwrk/proof-server\n" +
            `Detail: ${text}`,
          );
        }

        if (res.status === 503 || res.status === 502) {
          throw new Error(
            "Proof server is unreachable. Start a local Docker server:\n" +
            "docker run -d --rm -p 6300:6300 midnightntwrk/proof-server\n" +
            `Detail: ${text}`,
          );
        }

        throw new Error(`Proof generation failed [${res.status}]: ${text}`);
      }

      return new Uint8Array(await res.arrayBuffer());
    },
  };
}
