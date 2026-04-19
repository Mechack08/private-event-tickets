"use client";

/**
 * /verify-ticket
 *
 * Attendee flow — proves ticket ownership using a ZK proof without revealing
 * identity or which specific ticket is being claimed.
 *
 * The attendee pastes the TicketSecret JSON they received from the organizer.
 * The SDK derives holder_pubkey_field from the connected wallet's own key,
 * so the proof is always bound to the caller's identity.
 *
 * SDK modules are dynamically imported inside the submit handler to avoid
 * the SSR crash caused by @midnight-ntwrk/ledger-v8.
 */

import Link from "next/link";
import { useState } from "react";
import { WalletConnect } from "@/components/WalletConnect";
import { useLaceWallet } from "@/hooks/useLaceWallet";
import type { TicketSecret } from "@/../../sdk/src/types";

type VerifyPhase = "idle" | "parsing" | "proving" | "done" | "error";

export default function VerifyTicketPage() {
  const { status, wallet } = useLaceWallet();

  const [secretJson, setSecretJson] = useState("");
  const [contractOverride, setContractOverride] = useState("");
  const [phase, setPhase] = useState<VerifyPhase>("idle");
  const [verified, setVerified] = useState<boolean | null>(null);
  const [txId, setTxId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isWalletReady = status === "connected" && wallet !== null;
  const loading = phase === "parsing" || phase === "proving";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isWalletReady) return;

    setPhase("parsing");
    setError(null);
    setVerified(null);
    setTxId(null);

    // ── Parse TicketSecret ───────────────────────────────────────────────
    let secret: TicketSecret;
    try {
      secret = JSON.parse(secretJson) as TicketSecret;
      if (
        typeof secret.contractAddress !== "string" ||
        typeof secret.nonce !== "string"
      ) {
        throw new Error("JSON is missing required fields (contractAddress, nonce).");
      }
    } catch (err) {
      setError(
        "Could not parse ticket secret: " +
          (err instanceof Error ? err.message : String(err)),
      );
      setPhase("error");
      return;
    }

    const resolvedAddress = contractOverride.trim() || secret.contractAddress;

    setPhase("proving");

    try {
      // ── Dynamic imports ─────────────────────────────────────────────────
      const [
        { createEventTicketProviders },
        { EventTicketAPI, hexToBigint },
        { PREPROD_CONFIG },
      ] = await Promise.all([
        import("@/../../sdk/src/providers"),
        import("@/../../sdk/src/contract-api"),
        import("@/../../sdk/src/types"),
      ]);

      const providers = await createEventTicketProviders(wallet, PREPROD_CONFIG);
      const api = await EventTicketAPI.join(providers, resolvedAddress);

      // ── Generate ZK proof and submit ────────────────────────────────────
      // The witness supplies the nonce; the circuit returns a boolean.
      const nonce = hexToBigint(secret.nonce);
      const { verified: ok, txId: id } = await api.verifyTicket(nonce);

      setVerified(ok);
      setTxId(id);
      setPhase("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase("error");
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
        <h1>Verify Ticket</h1>
        <p style={{ color: "var(--text-muted)", marginBottom: "1.5rem" }}>
          Prove you hold a valid ticket using a zero-knowledge proof. Your
          identity and ticket number are never revealed — only a
          pass&thinsp;/&thinsp;fail result is published on-chain.
        </p>

        <WalletConnect />

        <div className="card">
          <h2>Ticket Secret</h2>
          <form onSubmit={handleSubmit}>
            <label htmlFor="secretJson">
              Paste the ticket secret JSON from your organizer
            </label>
            <textarea
              id="secretJson"
              rows={6}
              placeholder={'{\n  "contractAddress": "0x…",\n  "nonce": "0x…"\n}'}
              value={secretJson}
              onChange={(e) => setSecretJson(e.target.value)}
              required
              style={{
                width: "100%",
                background: "var(--bg)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: "0.6rem 0.8rem",
                color: "var(--text)",
                fontFamily: "monospace",
                fontSize: "0.85rem",
                marginBottom: "1rem",
                resize: "vertical",
              }}
            />

            <label htmlFor="contractOverride">
              Contract address override{" "}
              <span style={{ color: "var(--text-muted)" }}>
                (optional — defaults to address in secret)
              </span>
            </label>
            <input
              id="contractOverride"
              type="text"
              placeholder="0x… (leave blank to use address from ticket secret)"
              value={contractOverride}
              onChange={(e) => setContractOverride(e.target.value)}
            />

            <button
              type="submit"
              className="btn-primary"
              disabled={loading || !isWalletReady}
            >
              {loading ? "Generating ZK proof…" : "Verify Ticket"}
            </button>

            {!isWalletReady && (
              <p
                style={{
                  color: "var(--text-muted)",
                  fontSize: "0.85rem",
                  marginTop: "0.5rem",
                }}
              >
                Connect the wallet that received this ticket to continue.
              </p>
            )}
          </form>

          {phase === "proving" && (
            <div className="status info">
              Generating zero-knowledge proof locally…
              <br />
              <small>
                This is CPU-intensive and may take 2–4 minutes. Your private
                data never leaves your browser.
              </small>
            </div>
          )}

          {phase === "done" && verified !== null && (
            <div className={`status ${verified ? "success" : "error"}`}>
              {verified ? (
                <>
                  <strong>✓ Ticket verified</strong>
                  <br />
                  You have proven ownership of a valid ticket for this event.
                  <br />
                  Tx ID: <code>{txId}</code>
                </>
              ) : (
                <>
                  <strong>✗ Verification failed</strong>
                  <br />
                  No matching commitment was found for the provided secret and
                  your wallet key. Check that you are using the correct wallet
                  and the correct ticket secret.
                </>
              )}
              <br />
              <br />
              <div
                style={{
                  background: "rgba(0,0,0,0.3)",
                  borderRadius: 6,
                  padding: "0.75rem",
                  fontSize: "0.8rem",
                  color: "var(--text-muted)",
                }}
              >
                <strong style={{ color: "var(--text)" }}>Privacy note</strong>
                <br />
                The ZK proof only discloses whether a valid commitment exists.
                The verifier cannot learn your identity, your ticket number, or
                the nonce value from the on-chain transaction.
              </div>
            </div>
          )}

          {(phase === "error" || error) && (
            <div className="status error">
              <strong>Error:</strong> {error}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
