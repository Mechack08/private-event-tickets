"use client";

/**
 * /issue-ticket
 *
 * Organizer flow — issues a ticket to an attendee by creating an on-chain
 * commitment.  The nonce is generated locally and must be shared with the
 * attendee off-chain (e.g. as a QR code).
 *
 * SDK modules are dynamically imported inside the submit handler to avoid
 * the SSR crash caused by @midnight-ntwrk/ledger-v8.
 */

import Link from "next/link";
import { useState } from "react";
import { WalletConnect } from "@/components/WalletConnect";
import { useLaceWallet } from "@/hooks/useLaceWallet";
import type { TicketSecret } from "@/../../sdk/src/types";

interface IssueResult {
  txId: string;
  secret: TicketSecret;
}

export default function IssueTicketPage() {
  const { status, wallet } = useLaceWallet();

  const [contractAddress, setContractAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<IssueResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isWalletReady = status === "connected" && wallet !== null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isWalletReady) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      // ── Dynamic imports ───────────────────────────────────────────────────
      const [
        { createEventTicketProviders },
        { EventTicketAPI },
        { PREPROD_CONFIG },
      ] = await Promise.all([
        import("@/../../sdk/src/providers"),
        import("@/../../sdk/src/contract-api"),
        import("@/../../sdk/src/types"),
      ]);

      const providers = await createEventTicketProviders(wallet, PREPROD_CONFIG);

      // Join the existing contract
      const api = await EventTicketAPI.join(providers, contractAddress.trim());

      // issueTicket() auto-generates a random nonce via the witness
      const { txId, nonce } = await api.issueTicket();

      const secret = api.ticketSecret(nonce);

      setResult({ txId, secret });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <nav className="nav">
        <Link href="/">Home</Link>
        <Link href="/create-event">Create Event</Link>
        <Link href="/issue-ticket">Issue Ticket</Link>
        <Link href="/verify-ticket">Verify Ticket</Link>
      </nav>

      <main className="container">
        <h1>Issue Ticket</h1>
        <p style={{ color: "var(--text-muted)", marginBottom: "1.5rem" }}>
          As the event organizer, commit a ticket to an attendee. A random nonce
          is generated and must be shared with the attendee — this is their
          private proof secret.
        </p>

        <WalletConnect />

        <div className="card">
          <h2>Ticket Details</h2>
          <form onSubmit={handleSubmit}>
            <label htmlFor="contractAddress">Contract address</label>
            <input
              id="contractAddress"
              type="text"
              placeholder="0x…"
              value={contractAddress}
              onChange={(e) => setContractAddress(e.target.value)}
              required
            />

            <button
              type="submit"
              className="btn-primary"
              disabled={loading || !isWalletReady}
            >
              {loading ? "Issuing ticket…" : "Issue Ticket"}
            </button>

            {!isWalletReady && (
              <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginTop: "0.5rem" }}>
                Connect your organizer wallet above to continue.
              </p>
            )}
          </form>

          {loading && (
            <div className="status info">
              Generating ZK proof and submitting issue_ticket transaction…
              <br />
              <small>This may take 2–4 minutes while the proof server runs.</small>
            </div>
          )}

          {result && (
            <div className="status success">
              <strong>Ticket issued!</strong>
              <br />
              Tx ID: <code>{result.txId}</code>
              <br />
              <br />
              <strong>Ticket secret — share this with the attendee:</strong>
              <pre>{JSON.stringify(result.secret, null, 2)}</pre>
              <small>
                The attendee pastes this JSON into the Verify Ticket page to
                prove ownership. Keep this safe — it is the only way to prove
                ticket ownership.
              </small>
            </div>
          )}

          {error && (
            <div className="status error">
              <strong>Error:</strong> {error}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
