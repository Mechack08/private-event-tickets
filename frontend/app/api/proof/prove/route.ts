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
 * Proof generation is CPU-intensive and can take 2–4 minutes on commodity
 * hardware, so this route has a 5-minute (300 s) timeout.
 */

import { NextRequest, NextResponse } from "next/server";

// 5-minute timeout — proof generation is CPU-intensive
export const maxDuration = 300;

const PROOF_SERVER = process.env.PROOF_SERVER_URL ?? "http://localhost:6300";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const upstream = await fetch(`${PROOF_SERVER}/prove`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // body is already validated JSON from the Midnight SDK — not user input
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(290_000), // slightly under maxDuration
    });

    const responseBody = await upstream.text();

    return new NextResponse(responseBody, {
      status: upstream.status,
      headers: { "Content-Type": "application/json" },
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
