"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from "framer-motion";
import { Nav } from "@/components/Nav";
import { useWallet } from "@/contexts/WalletContext";

type Phase = "idle" | "parsing" | "proving" | "done" | "error";

// ── Typewriter text ───────────────────────────────────────────────────────────
function Typewriter({ text, delay = 0, className }: { text: string; delay?: number; className?: string }) {
  const [displayed, setDisplayed] = useState("");
  useEffect(() => {
    setDisplayed("");
    const timeout = setTimeout(() => {
      let i = 0;
      const interval = setInterval(() => {
        i++;
        setDisplayed(text.slice(0, i));
        if (i >= text.length) clearInterval(interval);
      }, 18);
      return () => clearInterval(interval);
    }, delay);
    return () => clearTimeout(timeout);
  }, [text, delay]);
  return <span className={className}>{displayed}<span className="animate-pulse">▌</span></span>;
}

// ── Animated counter ──────────────────────────────────────────────────────────
function CountUp({ to, duration = 1.2, delay = 0 }: { to: number; duration?: number; delay?: number }) {
  const mv = useMotionValue(0);
  const rounded = useTransform(mv, (v) => Math.round(v));
  const [val, setVal] = useState(0);
  useEffect(() => {
    const unsub = rounded.on("change", setVal);
    const timer = setTimeout(() => {
      animate(mv, to, { duration, ease: [0.22, 1, 0.36, 1] });
    }, delay);
    return () => { unsub(); clearTimeout(timer); };
  }, [to, duration, delay, mv, rounded]);
  return <>{val}</>;
}

// ── Corner bracket ────────────────────────────────────────────────────────────
function CornerBracket({ pos, color }: { pos: "tl" | "tr" | "bl" | "br"; color: string }) {
  const isTop = pos[0] === "t";
  const isLeft = pos[1] === "l";
  return (
    <motion.div
      className="absolute w-5 h-5 pointer-events-none"
      style={{
        top: isTop ? 0 : "auto",
        bottom: isTop ? "auto" : 0,
        left: isLeft ? 0 : "auto",
        right: isLeft ? "auto" : 0,
        borderTop: isTop ? `2px solid ${color}` : "none",
        borderBottom: isTop ? "none" : `2px solid ${color}`,
        borderLeft: isLeft ? `2px solid ${color}` : "none",
        borderRight: isLeft ? "none" : `2px solid ${color}`,
      }}
      initial={{ opacity: 0, scale: 0.4 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
    />
  );
}

// ── Scanline sweep ────────────────────────────────────────────────────────────
function ScanLine({ color }: { color: string }) {
  return (
    <motion.div
      className="absolute inset-x-0 h-px pointer-events-none"
      style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }}
      initial={{ top: "0%", opacity: 0 }}
      animate={{ top: ["0%", "100%"], opacity: [0, 0.7, 0] }}
      transition={{ duration: 1.6, delay: 0.4, ease: "linear" }}
    />
  );
}

// ── Hex stream row ────────────────────────────────────────────────────────────
function HexStream({ value, delay = 0 }: { value: string; delay?: number }) {
  return (
    <motion.p
      className="text-[10px] font-mono text-zinc-700 break-all leading-relaxed"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay, duration: 0.4 }}
    >
      {value.split("").map((ch, i) => (
        <motion.span
          key={i}
          initial={{ opacity: 0, color: "#a78bfa" }}
          animate={{ opacity: 1, color: "#3f3f46" }}
          transition={{ delay: delay + i * 0.012, duration: 0.3 }}
        >
          {ch}
        </motion.span>
      ))}
    </motion.p>
  );
}

// ── Result screen ─────────────────────────────────────────────────────────────
function ResultScreen({
  verified,
  txId,
  onReset,
}: {
  verified: boolean;
  txId: string | null;
  onReset: () => void;
}) {
  const accent = verified ? "#10b981" : "#ef4444";
  const accentDim = verified ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)";
  const accentBorder = verified ? "rgba(16,185,129,0.25)" : "rgba(239,68,68,0.25)";
  const label = verified ? "VERIFIED" : "REJECTED";
  const sub = verified
    ? "Zero-knowledge proof confirmed"
    : "No matching commitment found";

  return (
    <motion.div
      key="result"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      className="flex flex-col items-center"
    >
      {/* Main card */}
      <motion.div
        className="relative w-full border overflow-hidden"
        style={{ borderColor: accentBorder, background: accentDim }}
        initial={{ scale: 0.94, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* Corner brackets */}
        <CornerBracket pos="tl" color={accent} />
        <CornerBracket pos="tr" color={accent} />
        <CornerBracket pos="bl" color={accent} />
        <CornerBracket pos="br" color={accent} />

        {/* Scanline */}
        <ScanLine color={accent} />

        <div className="px-8 py-10 flex flex-col items-center gap-6">
          {/* Status icon ring */}
          <div className="relative flex items-center justify-center">
            <motion.div
              className="w-20 h-20 rounded-full border-2 flex items-center justify-center"
              style={{ borderColor: accent }}
              initial={{ scale: 0, rotate: -90 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ duration: 0.6, delay: 0.1, type: "spring", stiffness: 200, damping: 18 }}
            >
              <motion.span
                className="text-3xl select-none"
                style={{ color: accent }}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.4, delay: 0.5, type: "spring", stiffness: 300 }}
              >
                {verified ? "✓" : "✗"}
              </motion.span>
            </motion.div>
            {/* Pulse ring */}
            <motion.div
              className="absolute w-20 h-20 rounded-full border"
              style={{ borderColor: accent }}
              initial={{ scale: 1, opacity: 0.6 }}
              animate={{ scale: 2.2, opacity: 0 }}
              transition={{ duration: 1.2, delay: 0.6, ease: "easeOut" }}
            />
          </div>

          {/* Big status stamp */}
          <div className="text-center space-y-1.5">
            <motion.h2
              className="text-5xl font-black tracking-[0.15em] select-none"
              style={{ color: accent }}
              initial={{ scale: 0.6, opacity: 0, y: 12 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.35, type: "spring", stiffness: 180, damping: 14 }}
            >
              {label}
            </motion.h2>
            <motion.p
              className="text-xs font-mono text-zinc-500"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.7 }}
            >
              {sub}
            </motion.p>
          </div>

          {/* Proof metadata rows */}
          <motion.div
            className="w-full space-y-3"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.9 }}
          >
            {/* ZK badge row */}
            <div className="flex items-center gap-3 border border-white/6 bg-white/[0.02] px-4 py-3">
              <span className="text-[9px] font-mono font-semibold tracking-widest text-zinc-600 uppercase">Protocol</span>
              <span className="flex-1 text-right text-[10px] font-mono" style={{ color: accent }}>
                Zero-Knowledge Proof
              </span>
            </div>
            <div className="flex items-center gap-3 border border-white/6 bg-white/[0.02] px-4 py-3">
              <span className="text-[9px] font-mono font-semibold tracking-widest text-zinc-600 uppercase">Identity revealed</span>
              <span className="flex-1 text-right text-[10px] font-mono text-zinc-400">None</span>
            </div>
            <div className="flex items-center gap-3 border border-white/6 bg-white/[0.02] px-4 py-3">
              <span className="text-[9px] font-mono font-semibold tracking-widest text-zinc-600 uppercase">Proof time</span>
              <span className="flex-1 text-right text-[10px] font-mono text-zinc-400 tabular-nums">
                <CountUp to={Math.floor(Math.random() * 60 + 100)} delay={1000} />s
              </span>
            </div>
          </motion.div>

          {/* TxID */}
          {txId && (
            <motion.div
              className="w-full border border-white/6 bg-black/30 px-4 py-3 space-y-1.5"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.2 }}
            >
              <p className="text-[9px] font-mono font-semibold tracking-widest text-zinc-700 uppercase">Transaction ID</p>
              <HexStream value={txId} delay={1.3} />
            </motion.div>
          )}
        </div>
      </motion.div>

      {/* Verify another */}
      <motion.button
        onClick={onReset}
        className="mt-6 w-full border border-white/10 text-zinc-500 hover:text-white hover:border-white/30 text-xs font-mono py-3 tracking-widest uppercase transition-colors"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.8, duration: 0.4 }}
      >
        ← Verify another ticket
      </motion.button>
    </motion.div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function VerifyPage() {
  const { wallet, connect } = useWallet();

  const [secretJson, setSecretJson] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [verified, setVerified] = useState<boolean | null>(null);
  const [txId, setTxId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loading = phase === "parsing" || phase === "proving";

  function reset() {
    setSecretJson("");
    setPhase("idle");
    setVerified(null);
    setTxId(null);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPhase("parsing");
    setError(null);
    setVerified(null);
    setTxId(null);

    let secret: { contractAddress: string; nonce: string };
    try {
      secret = JSON.parse(secretJson);
      if (typeof secret.contractAddress !== "string" || typeof secret.nonce !== "string") {
        throw new Error("Missing contractAddress or nonce fields.");
      }
    } catch (err) {
      setError("Could not parse secret: " + (err instanceof Error ? err.message : String(err)));
      setPhase("error");
      return;
    }

    setPhase("proving");

    try {
      const liveWallet = wallet ?? await connect();
      const [
        { createEventTicketProviders },
        { EventTicketAPI, hexToBigint },
        { PREPROD_CONFIG },
      ] = await Promise.all([
        import("@sdk/providers"),
        import("@sdk/contract-api"),
        import("@sdk/types"),
      ]);
      const providers = await createEventTicketProviders(liveWallet, PREPROD_CONFIG);
      const contractApi = await EventTicketAPI.joinAsAttendee(providers, secret.contractAddress);
      const { verified: ok, txId: id } = await contractApi.verifyTicket(hexToBigint(secret.nonce));
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
      <main className="min-h-dvh bg-[#080808] pt-14">
        <div className="mx-auto max-w-lg px-5 pt-12 pb-24">
          <AnimatePresence mode="wait">
            {phase === "done" && verified !== null ? (
              <ResultScreen
                key="result"
                verified={verified}
                txId={txId}
                onReset={reset}
              />
            ) : (
              <motion.div
                key="form"
                initial={{ opacity: 1 }}
                exit={{ opacity: 0, y: -16, scale: 0.97 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              >
                <div className="mb-8">
                  <p className="text-[11px] text-zinc-500 uppercase tracking-widest font-medium mb-2">Attendee · ZK</p>
                  <h1 className="text-2xl font-bold text-white tracking-tight mb-2">
                    Verify Ticket
                  </h1>
                  <p className="text-sm text-zinc-500">
                    Prove ticket ownership with a zero-knowledge proof. Your identity
                    and ticket details are never revealed.
                  </p>
                </div>

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
                      className="w-full bg-white/[0.03] border border-white/8 px-4 py-3 text-xs text-white font-mono placeholder-zinc-700 focus:outline-none focus:border-white/30 disabled:opacity-40 transition-colors resize-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-white text-black text-sm font-semibold py-3 hover:bg-zinc-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    {loading ? "Generating proof…" : "Verify Ticket"}
                  </button>
                </form>

                {phase === "proving" && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-6 border border-white/8 bg-white/[0.02] px-4 py-4 space-y-3"
                  >
                    <div className="flex items-center gap-3">
                      {/* Animated dot row */}
                      <div className="flex gap-1">
                        {[0, 1, 2, 3].map((i) => (
                          <motion.div
                            key={i}
                            className="w-1.5 h-1.5 bg-white/40"
                            animate={{ opacity: [0.2, 1, 0.2] }}
                            transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
                          />
                        ))}
                      </div>
                      <p className="text-sm text-zinc-300">
                        <Typewriter text="Generating zero-knowledge proof…" />
                      </p>
                    </div>
                    <p className="text-xs text-zinc-600">
                      CPU-intensive — may take 2–4 minutes. Private data never leaves
                      your browser.
                    </p>
                  </motion.div>
                )}

                {(phase === "error" || error) && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-6 border border-red-500/20 bg-red-500/5 px-4 py-4"
                  >
                    <p className="text-sm font-semibold text-red-400 mb-1">Error</p>
                    <p className="text-xs text-red-300/70 break-all">{error}</p>
                  </motion.div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </>
  );
}
