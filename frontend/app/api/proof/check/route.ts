/**
 * GET /api/proof/check
 *
 * Pings the locally-running Docker proof server to verify it is reachable.
 * Used by the frontend to show a health indicator before attempting a proof.
 *
 * Proof server must be running:
 *   docker run -d --rm -p 6300:6300 midnightntwrk/proof-server
 */

import { NextResponse } from "next/server";

// 30-second timeout for a health check
export const maxDuration = 30;

const PROOF_SERVER = process.env.PROOF_SERVER_URL ?? "http://localhost:6300";

export async function GET() {
  try {
    const res = await fetch(`${PROOF_SERVER}/health`, {
      method: "GET",
      signal: AbortSignal.timeout(5_000),
    });
    if (res.ok) {
      return NextResponse.json({ status: "ok" });
    }
    return NextResponse.json(
      { status: "error", detail: `proof server returned ${res.status}` },
      { status: 502 },
    );
  } catch (err) {
    return NextResponse.json(
      {
        status: "unreachable",
        detail: "Proof server not reachable. Is Docker running? " + String(err),
      },
      { status: 503 },
    );
  }
}
