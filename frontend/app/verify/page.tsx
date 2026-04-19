"use client";

import { useState } from "react";
import { Nav } from "@/components/Nav";
import { WalletConnect } from "@/components/WalletConnect";
import { useWallet } from "@/contexts/WalletContext";

type Phase = "idle" | "parsing" | "proving" | "done" | "error";

export default function VerifyPage() {
  const { status, wallet } = useWallet();

  const [secretJson, setSecretJson] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
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

    let secret: { contractAddress: string; nonce: string };
    try {
      secret = JSON.parse(secretJson);
      if (
        typeof secret.contractAddress !== "string" ||
        typeof secret.nonce !== "string"
      ) {
        throw new Error("Missing contractAddress or nonce fields.");
      }
    } catch (err) {
      setError(
        "Could not parse secret: " +
          (err instanceof Error ? err.message : String(err)),
      );
      setPhase("error");
      return;
    }

    setPhase("proving");

    try {
      const [
        { createEventTicketProviders },
        { EventTicketAPI, hexToBigint },
        { PREPROD_CONFIG },
      ] = await Promise.all([
        import("@sdk/providers"),
        import("@sdk/contract-api"),
        import("@sdk/types"),
      ]);

      const providers = await createEventTicketProviders(wallet, PREPROD_CONFIG);
      const api = await EventTicketAPI.join(providers, secret.contractAddress);
      const { verified: ok, txId: id } = await api.verifyTicket(
        hexToBigint(secret.nonce),
      );
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
      <Nav />
      <main className="min-h-dvh bg-[#0a0a0a] pt-14">
        <div className="mx-auto max-w-lg px-5 pt-12 pb-24">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-white tracking-tight mb-2">
              Verify Ticket
            </h1>
            <p className="text-sm text-zinc-500">
              Prove ticket ownership with a zero-knowledge proof. Your identity
              and ticket details are never revealed.
            </p>
          </div>

          <WalletConnect />

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label
                htmlFor="secretJson"
                className="block text-xs font-medium text-zinc-400 mb-2"
              >
                Ticket secret
              </label>
              <textarea
                id="secretJson"
                rows={5}
                placeholder={'{\n  "contractAddress": "0x…",\n  "nonce": "0x…"\n}'}
                value={secretJson}
                onChange={(e) => setSecretJson(e.target.value)}
                required
                disabled={loading}
                className="w-full bg-white/4 border border-white/10 rounded-xl px-4 py-3 text-xs text-white font-mono placeholder-zinc-600 focus:outline-none focus:border-white/30 disabled:opacity-40 transition-colors resize-none"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !isWalletReady}
              className="w-full bg-white text-black text-sm font-medium py-3 rounded-xl hover:bg-zinc-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? "Generating proof…" : "Verify Ticket"}
            </button>

            {!isWalletReady && (
              <p className="text-xs text-zinc-600 text-center">
                Connect the wallet that received this ticket
              </p>
            )}
          </form>

          {phase === "proving" && (
            <div className="mt-6 rounded-xl border border-white/8 bg-white/3 px-4 py-4 space-y-1">
              <p className="text-sm text-zinc-300">
                Generating zero-knowledge proof…
              </p>
              <p className="text-xs text-zinc-600">
                CPU-intensive — may take 2–4 minutes. Private data never leaves
                your browser.
              </p>
            </div>
          )}

          {phase === "done" && verified !== null && (
            <div
              className={`mt-6 rounded-xl border px-4 py-5 space-y-3 ${
                verified
                  ? "border-emerald-500/20 bg-emerald-500/6"
                  : "border-red-500/20 bg-red-500/6"
              }`}
            >
              <p
                className={`text-base font-semibold ${
                  verified ? "text-emerald-400" : "text-red-400"
                }`}
              >
                {verified ? "Ticket verified" : "Verification failed"}
              </p>
              <p className="text-xs text-zinc-400">
                {verified
                  ? "Valid ticket ownership proved. No identity was revealed."
                  : "No matching commitment found. Check your secret and wallet."}
              </p>
              {txId && (
                <div>
                  <p className="text-xs text-zinc-600">Transaction</p>
                  <p className="text-xs font-mono text-white/50 break-all mt-0.5">
                    {txId}
                  </p>
                </div>
              )}
              <div className="rounded-lg border border-white/6 bg-white/3 px-3 py-3">
                <p className="text-xs text-zinc-500">
                  The ZK proof discloses only whether a valid commitment exists
                  — not your identity, nonce, or which commitment matched.
                </p>
              </div>
            </div>
          )}

          {(phase === "error" || error) && (
            <div className="mt-6 rounded-xl border border-red-500/20 bg-red-500/6 px-4 py-4">
              <p className="text-sm font-medium text-red-400 mb-1">Error</p>
              <p className="text-xs text-red-300/70 break-all">{error}</p>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
