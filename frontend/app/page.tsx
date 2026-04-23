"use client";

import Link from "next/link";
import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import { Nav } from "@/components/Nav";
import { useWallet } from "@/contexts/WalletContext";

// ─── Animation presets ──────────────────────────────────────────────────────
const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
  },
};

const stagger = (delayChildren = 0.1) => ({
  hidden: {},
  show: { transition: { staggerChildren: delayChildren } },
});

const scrollReveal = {
  hidden: { opacity: 0, y: 28 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.65, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
  },
};

// ─── Reusable scroll-reveal wrapper ────────────────────────────────────────
function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-64px" }}
      variants={{
        hidden: { opacity: 0, y: 24 },
        show: {
          opacity: 1,
          y: 0,
          transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as [number, number, number, number], delay },
        },
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ─── Stat chip ──────────────────────────────────────────────────────────────
function StatChip({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5 px-5 py-3 border border-white/8 bg-white/[0.025]">
      <span className="text-xl font-bold text-white tabular-nums">{value}</span>
      <span className="text-[11px] text-zinc-500 uppercase tracking-widest">{label}</span>
    </div>
  );
}

// ─── Feature card ───────────────────────────────────────────────────────────
function FeatureCard({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <motion.div
      variants={scrollReveal}
      style={{ backgroundColor: "#0d0d0d", borderColor: "rgba(255,255,255,0.08)" }}
      className="border p-5 flex flex-col gap-3"
      whileHover={{
        backgroundColor: "rgba(255,255,255,0.05)",
        borderColor: "rgba(255,255,255,0.20)",
        transition: { duration: 0.18, ease: "easeOut" },
      }}
    >
      <div className="w-9 h-9 flex items-center justify-center border border-white/8 bg-white/[0.03] text-zinc-400">
        {icon}
      </div>
      <p className="text-sm font-semibold text-white">{title}</p>
      <p className="text-xs text-zinc-500 leading-relaxed">{body}</p>
    </motion.div>
  );
}

// ─── Timeline step (scroll-reactive) ────────────────────────────────────────
function FlowStep({
  n,
  role,
  title,
  body,
  href,
  locked,
  isLast,
}: {
  n: string;
  role: "organizer" | "attendee";
  title: string;
  body: string;
  href: string;
  locked: boolean;
  isLast: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px 0px" });

  const card = (
    <div
      className="relative overflow-hidden border p-5 group"
      style={{ borderColor: "rgba(255,255,255,0.07)" }}
    >
      <motion.div
        className="absolute inset-0 pointer-events-none"
        animate={inView ? { opacity: 1 } : { opacity: 0 }}
        style={{
          background:
            "linear-gradient(135deg, rgba(255,255,255,0.03) 0%, transparent 60%)",
        }}
        transition={{ duration: 0.6 }}
      />
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <h3 className="text-sm font-semibold text-white">{title}</h3>
            <span className="text-[10px] font-medium border border-white/10 text-zinc-500 px-1.5 py-0.5 uppercase tracking-wider">
              {role}
            </span>
            {locked && (
              <span className="text-[10px] font-medium border border-white/8 text-zinc-700 px-1.5 py-0.5 uppercase tracking-wider">
                wallet required
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-500 leading-relaxed">{body}</p>
        </div>
        <span className="text-zinc-700 group-hover:text-zinc-300 transition-colors shrink-0 text-sm">
          →
        </span>
      </div>
    </div>
  );

  return (
    <div ref={ref} className="flex gap-5">
      {/* ── Spine ── */}
      <div className="flex flex-col items-center shrink-0" style={{ width: 32 }}>
        <motion.div
          animate={
            inView
              ? {
                  borderColor: "rgba(255,255,255,0.55)",
                  backgroundColor: "rgba(255,255,255,0.06)",
                }
              : {
                  borderColor: "rgba(255,255,255,0.08)",
                  backgroundColor: "rgba(0,0,0,0)",
                }
          }
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] as [number,number,number,number] }}
          className="w-8 h-8 border flex items-center justify-center shrink-0"
          style={{ borderColor: "rgba(255,255,255,0.08)" }}
        >
          <motion.span
            animate={
              inView
                ? { opacity: 1, color: "#ffffff" }
                : { opacity: 0.2, color: "#52525b" }
            }
            transition={{ duration: 0.4, delay: 0.1 }}
            className="font-mono text-[10px] font-bold"
            style={{ color: "#52525b" }}
          >
            {n}
          </motion.span>
        </motion.div>

        {!isLast && (
          <div
            className="flex-1 w-px mt-1 overflow-hidden"
            style={{ minHeight: 28, backgroundColor: "rgba(255,255,255,0.06)" }}
          >
            <motion.div
              className="w-full h-full"
              style={{
                backgroundColor: "rgba(255,255,255,0.22)",
                scaleY: 0,
                transformOrigin: "top",
              }}
              animate={inView ? { scaleY: 1 } : { scaleY: 0 }}
              transition={{ duration: 0.7, delay: 0.3, ease: [0.22, 1, 0.36, 1] as [number,number,number,number] }}
            />
          </div>
        )}
      </div>

      {/* ── Card ── */}
      <motion.div
        className="flex-1 pb-3"
        animate={inView ? { opacity: 1, x: 0 } : { opacity: 0, x: 22 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] as [number,number,number,number], delay: 0.05 }}
      >
        {locked ? (
          <div className="opacity-35 cursor-not-allowed select-none">{card}</div>
        ) : (
          <Link href={href} className="block hover:opacity-90 transition-opacity">
            {card}
          </Link>
        )}
      </motion.div>
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────
export default function HomePage() {
  const { status } = useWallet();
  const connected = status === "connected";

  return (
    <>
      <Nav />

      {/* Subtle grid background — static, non-distracting */}
      <div className="pointer-events-none fixed inset-0 grid-lines opacity-100" aria-hidden />

      <main className="relative z-10 min-h-dvh pt-14">
        {/* ── HERO ─────────────────────────────────────────────────── */}
        <section className="mx-auto max-w-4xl px-5 pt-28 pb-20 text-center">
          {/* Entrance: staggered children */}
          <motion.div
            initial="hidden"
            animate="show"
            variants={stagger(0.12)}
            className="flex flex-col items-center"
          >
            {/* Status badge */}
            <motion.div variants={fadeUp} className="mb-10">
              <div className="inline-flex items-center gap-2 border border-white/10 bg-white/[0.03] px-3 py-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span className="text-[11px] font-medium text-zinc-400 uppercase tracking-widest">
                  Midnight Network · Zero-Knowledge
                </span>
              </div>
            </motion.div>

            {/* Main headline */}
            <motion.h1
              variants={fadeUp}
              className="text-5xl sm:text-7xl font-black tracking-tighter leading-[0.93] mb-6 text-white"
            >
              <span className="block">Events that</span>
              <span className="block text-zinc-300">respect privacy</span>
            </motion.h1>

            <motion.p
              variants={fadeUp}
              className="text-base sm:text-lg text-zinc-400 max-w-xl mx-auto mb-4 leading-relaxed"
            >
              The first full-featured ticketing platform built on{" "}
              <span className="text-white font-medium">Midnight Network</span>.
              Paid or free, age-gated, or open — with zero-knowledge proofs
              ensuring your attendees&apos; privacy is never compromised.
            </motion.p>

            {/* CTAs */}
            <motion.div
              variants={fadeUp}
              className="flex items-center justify-center gap-3 flex-wrap mt-8"
            >
              {connected ? (
                <>
                  <Link
                    href="/events/new"
                    className="inline-flex items-center gap-2 bg-white text-black text-sm font-semibold px-6 py-3 hover:bg-zinc-100 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                    Create an Event
                  </Link>
                  <Link
                    href="/events"
                    className="inline-flex items-center gap-2 border border-white/15 text-white text-sm px-6 py-3 hover:bg-white/6 transition-colors"
                  >
                    Browse Events →
                  </Link>
                </>
              ) : (
                <>
                  <Link
                    href="/events"
                    className="inline-flex items-center gap-2 bg-white text-black text-sm font-semibold px-6 py-3 hover:bg-zinc-100 transition-colors"
                  >
                    Browse Events →
                  </Link>
                  <p className="w-full text-xs text-zinc-600 mt-1">
                    Connect a Midnight wallet to create events or buy tickets.
                  </p>
                </>
              )}
            </motion.div>

            {/* Stats */}
            <motion.div
              variants={fadeUp}
              className="flex items-center justify-center gap-0 mt-14 flex-wrap"
            >
              <StatChip value="ZK" label="Privacy proofs" />
              <StatChip value="∞" label="Ticket capacity" />
              <StatChip value="0ms" label="ID revealed" />
              <StatChip value="100%" label="On-chain verifiable" />
            </motion.div>
          </motion.div>
        </section>

        {/* ── FEATURES ─────────────────────────────────────────────── */}
        <section className="mx-auto max-w-4xl px-5 pb-24">
          <Reveal className="mb-8">
            <p className="text-[11px] text-zinc-500 uppercase tracking-widest font-medium mb-2">Platform</p>
            <h2 className="text-2xl font-bold text-white tracking-tight">Everything a real ticketing platform needs</h2>
          </Reveal>

          <motion.div
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-80px" }}
            variants={stagger(0.07)}
          >
            <FeatureCard
              icon={
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125H18M15 10.5H9" />
                </svg>
              }
              title="Free & paid events"
              body="Set a ticket price in any Midnight-supported currency. Free events work with zero friction — no wallet required to browse."
            />
            <FeatureCard
              icon={
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                </svg>
              }
              title="Age-gated access"
              body="Require attendees to ZK-prove they meet an age threshold — no birth date ever leaves their device."
            />
            <FeatureCard
              icon={
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
                </svg>
              }
              title="ZK proof of eligibility"
              body="Attendees prove age, membership, or payment — without disclosing the underlying data. Verification is instant and on-chain."
            />
            <FeatureCard
              icon={
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
                </svg>
              }
              title="Rich event details"
              body="Location, date, time, cover image, description, and custom tags — all stored off-chain via the platform backend."
            />
            <FeatureCard
              icon={
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
                </svg>
              }
              title="Organizer dashboard"
              body="Manage requests, approve or reject attendees, monitor capacity, and export check-in lists — all in one place."
            />
            <FeatureCard
              icon={
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.864 4.243A7.5 7.5 0 0 1 19.5 10.5c0 2.92-.556 5.709-1.568 8.268M5.742 6.364A7.465 7.465 0 0 0 4.5 10.5a7.464 7.464 0 0 1-1.15 3.993m1.989 3.559A11.209 11.209 0 0 0 8.25 10.5a3.75 3.75 0 1 1 7.5 0c0 .527-.021 1.049-.064 1.565M12 10.5a14.94 14.94 0 0 1-3.6 9.75m6.633-4.596a18.666 18.666 0 0 1-2.485 5.33" />
                </svg>
              }
              title="Any Midnight wallet"
              body="Works with any wallet implementing the Midnight DApp Connector API — Lace, Eternl, and future wallets."
            />
          </motion.div>
        </section>

        {/* ── HOW IT WORKS ─────────────────────────────────────────── */}
        <section className="mx-auto max-w-4xl px-5 pb-24">
          <Reveal className="mb-10">
            <p className="text-[11px] text-zinc-500 uppercase tracking-widest font-medium mb-2">How it works</p>
            <h2 className="text-2xl font-bold text-white tracking-tight">From creation to proof</h2>
          </Reveal>

          <div className="space-y-0">
            <FlowStep
              n="01"
              role="organizer"
              title="Create your event"
              body="Deploy the ZK contract, set name, capacity, price, age restrictions, and upload event details to the backend."
              href="/events/new"
              locked={!connected}
              isLast={false}
            />
            <FlowStep
              n="02"
              role="attendee"
              title="Buy or request a ticket"
              body="Browse public events. Pay if required, prove eligibility with ZK proofs from your wallet — no ID documents shared."
              href="/events"
              locked={false}
              isLast={false}
            />
            <FlowStep
              n="03"
              role="organizer"
              title="Approve & issue tickets"
              body="Review requests and approve attendees. Each approval commits a Poseidon-hashed nonce to the on-chain ledger."
              href="/events"
              locked={!connected}
              isLast={false}
            />
            <FlowStep
              n="04"
              role="attendee"
              title="Prove ownership at the door"
              body="At entry, generate a ZK proof from your ticket secret. The verifier sees only pass or fail — identity stays private."
              href="/verify"
              locked={false}
              isLast={true}
            />
          </div>
        </section>

        {/* ── PRIVACY MODEL ────────────────────────────────────────── */}
        <section className="mx-auto max-w-4xl px-5 pb-24">
          <Reveal>
            <div className="border border-white/8 bg-white/[0.02] p-8">
              <p className="text-[11px] text-zinc-500 uppercase tracking-widest font-medium mb-6">Privacy model</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
                {[
                  {
                    title: "Zero identity disclosure",
                    body: "ZK proofs reveal only the statement proved — age ≥ 18, valid ticket — never the underlying data.",
                  },
                  {
                    title: "Commitments, not keys",
                    body: "Only Poseidon hashes of ticket nonces appear on-chain. Names, emails, and pubkeys never touch the ledger.",
                  },
                  {
                    title: "Secrets stay local",
                    body: "Your ticket nonce is generated client-side and shared directly. The platform never sees your secret.",
                  },
                ].map(({ title, body }) => (
                  <div key={title} className="flex flex-col gap-2">
                    <div className="w-4 h-px bg-white/30 mb-2" />
                    <p className="text-sm font-semibold text-white">{title}</p>
                    <p className="text-xs text-zinc-500 leading-relaxed">{body}</p>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        </section>

        {/* ── BOTTOM CTA (only when disconnected) ──────────────────── */}
        {!connected && (
          <section className="mx-auto max-w-4xl px-5 pb-24">
            <Reveal>
              <div className="border border-white/8 bg-white/[0.02] border-shimmer px-8 py-12 text-center">
                <p className="text-xs text-zinc-500 uppercase tracking-widest font-medium mb-4">Get started</p>
                <h2 className="text-2xl font-bold text-white mb-3 tracking-tight">Ready to run privacy-first events?</h2>
                <p className="text-sm text-zinc-400 max-w-sm mx-auto mb-8">
                  Connect a Midnight-compatible wallet to create events, buy tickets, and manage your attendees.
                </p>
                <Link
                  href="/events"
                  className="inline-flex items-center gap-2 bg-white text-black text-sm font-semibold px-6 py-3 hover:bg-zinc-100 transition-colors"
                >
                  Explore Events →
                </Link>
              </div>
            </Reveal>
          </section>
        )}
      </main>
    </>
  );
}

