/**
 * http-proof-provider.ts
 *
 * Proxies ZK proof requests through the Next.js API routes
 * (/api/proof/check  and  /api/proof/prove) to the locally-running Docker
 * proof server, avoiding browser CORS restrictions.
 *
 * Proof server start command:
 *   docker run -d --rm -p 6300:6300 midnightntwrk/proof-server
 *
 * The Next.js routes are defined in:
 *   frontend/app/api/proof/check/route.ts   (30 s timeout)
 *   frontend/app/api/proof/prove/route.ts   (5 min timeout)
 */

export class HttpProofProvider {
  constructor(private readonly proxyBase: string = "/api/proof") {}

  /**
   * Ping the proof server via the check proxy.
   * Returns true if the server is reachable and healthy.
   */
  async check(): Promise<boolean> {
    try {
      const res = await fetch(`${this.proxyBase}/check`, { method: "GET" });
      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * Send a proof request to the proof server via the prove proxy.
   *
   * @param request  Serialisable proof request body from the Midnight SDK.
   * @returns        Proof response (opaque to this layer; passed back to SDK).
   * @throws         On HTTP error or proof generation failure.
   */
  async prove(request: unknown): Promise<unknown> {
    const res = await fetch(`${this.proxyBase}/prove`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // `request` is serialised by the Midnight SDK — never user-supplied.
      body: JSON.stringify(request),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "(no body)");
      throw new Error(`Proof generation failed [${res.status}]: ${text}`);
    }

    return res.json();
  }
}
