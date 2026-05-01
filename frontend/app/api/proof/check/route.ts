/**
 * GET  /api/proof/check  — health-ping the Docker proof server
 * POST /api/proof/check  — proxy a binary check payload to the proof server
 *
 * Proof server must be running:
 *   docker run -d --rm -p 6300:6300 midnightntwrk/proof-server
 */

import { NextRequest, NextResponse } from "next/server";

// 30-second timeout
export const maxDuration = 30;

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

export async function GET() {
  try {
    const res = await fetch(`${DEFAULT_PROOF_SERVER}/health`, {
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

export async function POST(req: NextRequest) {
  const proofServer = resolveProofServer(req);
  const body = await req.arrayBuffer();

  try {
    const upstream = await fetch(`${proofServer}/check`, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: body,
      signal: AbortSignal.timeout(25_000),
    });

    const responseBody = await upstream.arrayBuffer();
    return new NextResponse(responseBody, {
      status: upstream.status,
      headers: { "Content-Type": "application/octet-stream" },
    });
  } catch (err) {
    return NextResponse.json(
      { status: "unreachable", detail: String(err) },
      { status: 503 },
    );
  }
}
