"use client";

/**
 * /create-event
 *
 * Organizer flow — deploys a new event-tickets contract to Midnight preprod.
 *
 * SDK modules are dynamically imported inside the submit handler to avoid
 * the SSR crash caused by @midnight-ntwrk/ledger-v8 calling readFileSync
 * at module load time.
 */

import Link from "next/link";
import { useState } from "react";
import { WalletConnect } from "@/components/WalletConnect";
import { useLaceWallet } from "@/hooks/useLaceWallet";

interface CreateResult {
  contractAddress: string;
  txId: string;
}

export default function CreateEventPage() {
  const { status, wallet } = useLaceWallet();

  const [eventName, setEventName] = useState("");
  const [maxTickets, setMaxTickets] = useState("50");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CreateResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isWalletReady = status === "connected" && wallet !== null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isWalletReady) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      // ── Dynamic imports (never at top level) ─────────────────────────────
      const [{ createEventTicketProviders }, { EventTicketAPI }, { PREPROD_CONFIG }] =
        await Promise.all([
          import("@/../../sdk/src/providers"),
          import("@/../../sdk/src/contract-api"),
          import("@/../../sdk/src/types"),
        ]);

      const providers = await createEventTicketProviders(wallet, PREPROD_CONFIG);

      // Deploy a brand-new contract instance
      const api = await EventTicketAPI.deploy(providers);

      // Initialise the event on-chain
      const { txId } = await api.createEvent(
        eventName.trim(),
        parseInt(maxTickets, 10),
      );

      setResult({ contractAddress: api.contractAddress, txId });
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
        <h1>Create Event</h1>
        <p style={{ color: "var(--text-muted)", marginBottom: "1.5rem" }}>
          Deploy a new ticketing contract on Midnight preprod. You become the
          organizer — only your wallet can issue tickets for this event.
        </p>

        <WalletConnect />

        <div className="card">
          <h2>Event Details</h2>
          <form onSubmit={handleSubmit}>
            <label htmlFor="eventName">Event name</label>
            <input
              id="eventName"
              type="text"
              placeholder="e.g. DevCon 2026"
              value={eventName}
              onChange={(e) => setEventName(e.target.value)}
              maxLength={128}
              required
            />

            <label htmlFor="maxTickets">Maximum tickets (1 – 100)</label>
            <input
              id="maxTickets"
              type="number"
              min={1}
              max={100}
              value={maxTickets}
              onChange={(e) => setMaxTickets(e.target.value)}
              required
            />

            <button
              type="submit"
              className="btn-primary"
              disabled={loading || !isWalletReady}
            >
              {loading ? "Deploying contract…" : "Create Event"}
            </button>

            {!isWalletReady && (
              <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginTop: "0.5rem" }}>
                Connect your Lace wallet above to continue.
              </p>
            )}
          </form>

          {loading && (
            <div className="status info">
              Deploying contract and submitting create_event transaction…
              <br />
              <small>This may take 30–60 seconds on preprod.</small>
            </div>
          )}

          {result && (
            <div className="status success">
              <strong>Event created!</strong>
              <br />
              Contract address:
              <br />
              <code>{result.contractAddress}</code>
              <br />
              <br />
              Tx ID: <code>{result.txId}</code>
              <br />
              <br />
              <span style={{ fontSize: "0.85rem" }}>
                Copy the contract address — you will need it for the Issue
                Ticket page.
              </span>
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
