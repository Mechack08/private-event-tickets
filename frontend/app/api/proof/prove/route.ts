/**
 * POST /api/proof/prove
 *
 * Proxies a ZK proof generation request from the browser to the locally-
 * running Docker proof server.  This route avoids browser CORS restrictions
 * because the proof server runs on localhost with no CORS headers.
 *
 * Proof server must be running:
 *   docker run -d --rm -p 6300:6300 midnightntwrk/proof-server
 *
 * Accepts: application/octet-stream — binary payload from createProvingPayload()
 * Returns: application/octet-stream — raw proof bytes
 *
 * Proof generation is CPU-intensive and can take 2–4 minutes on commodity
 * hardware, so this route has a 5-minute (300 s) timeout.
 */

import { NextRequest, NextResponse } from "next/server";

// 5-minute timeout — proof generation is CPU-intensive
export const maxDuration = 300;

const DEFAULT_PROOF_SERVER = process.env.PROOF_SERVER_URL ?? "http://localhost:6300";

/** Only allow forwarding to known-safe proof server origins (SSRF protection). */
function resolveProofServer(req: NextRequest): string {
  const header = req.headers.get("x-proof-server");
  if (header) {
    try {
      const url = new URL(header);
      const allowed =
        url.hostname === "localhost" ||
        url.hostname === "127.0.0.1" ||
        url.hostname.endsWith(".midnight.network");
      if (allowed) return header.replace(/\/$/, "");
    } catch { /* ignore malformed */ }
  }
  return DEFAULT_PROOF_SERVER;
}

export async function POST(req: NextRequest) {
  const proofServer = resolveProofServer(req);
  const body = await req.arrayBuffer();

  try {
    const upstream = await fetch(`${proofServer}/prove`, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: body,
      signal: AbortSignal.timeout(290_000),
    });

    const responseBody = await upstream.arrayBuffer();

    if (!upstream.ok) {
      return new NextResponse(responseBody, {
        status: upstream.status,
        headers: { "Content-Type": "application/octet-stream" },
      });
    }

    return new NextResponse(responseBody, {
      status: 200,
      headers: { "Content-Type": "application/octet-stream" },
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "Proof generation failed",
        detail: String(err),
      },
      { status: 503 },
    );
  }
}
