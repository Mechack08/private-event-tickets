"use client";

import Link from "next/link";
import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import { Nav } from "@/components/Nav";
import { useAuth } from "@/contexts/AuthContext";

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

  const roleColor = role === "organizer"
    ? "text-violet-400 border-violet-500/25 bg-violet-500/[0.07]"
    : "text-sky-400 border-sky-500/25 bg-sky-500/[0.07]";

  const card = (
    <div
      className="relative overflow-hidden border p-5 group"
      style={{ borderColor: "rgba(255,255,255,0.07)" }}
    >
      <motion.div
        className="absolute inset-0 pointer-events-none"
        animate={inView ? { opacity: 1 } : { opacity: 0 }}
        style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.03) 0%, transparent 60%)" }}
        transition={{ duration: 0.6 }}
      />
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <h3 className="text-sm font-semibold text-white">{title}</h3>
            <span className={`text-[10px] font-medium border px-1.5 py-0.5 uppercase tracking-wider ${roleColor}`}>
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
        <span className="text-zinc-700 group-hover:text-zinc-300 transition-colors shrink-0 text-sm">→</span>
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
              ? { borderColor: "rgba(255,255,255,0.55)", backgroundColor: "rgba(255,255,255,0.06)" }
              : { borderColor: "rgba(255,255,255,0.08)", backgroundColor: "rgba(0,0,0,0)" }
          }
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] as [number,number,number,number] }}
          className="w-8 h-8 border flex items-center justify-center shrink-0"
          style={{ borderColor: "rgba(255,255,255,0.08)" }}
        >
          <motion.span
            animate={inView ? { opacity: 1, color: "#ffffff" } : { opacity: 0.2, color: "#52525b" }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="font-mono text-[10px] font-bold"
            style={{ color: "#52525b" }}
          >
            {n}
          </motion.span>
        </motion.div>

        {!isLast && (
          <div className="flex-1 w-px mt-1 overflow-hidden" style={{ minHeight: 28, backgroundColor: "rgba(255,255,255,0.06)" }}>
            <motion.div
              className="w-full h-full"
              style={{ backgroundColor: "rgba(255,255,255,0.22)", scaleY: 0, transformOrigin: "top" }}
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
          <Link href={href} className="block hover:opacity-90 transition-opacity">{card}</Link>
        )}
      </motion.div>
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────
export default function HomePage() {
  const { user } = useAuth();
  const connected = user !== null;

  return (
    <>
      <Nav />

      {/* Subtle grid background */}
      <div className="pointer-events-none fixed inset-0 -z-10 grid-lines opacity-100" aria-hidden />

      <main className="relative z-10 min-h-dvh pt-14">

        {/* ── HERO ─────────────────────────────────────────────────── */}
        <section className="mx-auto max-w-4xl px-5 pt-28 pb-20 text-center">
          <motion.div initial="hidden" animate="show" variants={stagger(0.12)} className="flex flex-col items-center">

            {/* Status badge */}
            <motion.div variants={fadeUp} className="mb-10">
              <div className="inline-flex items-center gap-2 border border-white/10 bg-white/[0.03] px-3 py-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span className="text-[11px] font-medium text-zinc-400 uppercase tracking-widest">
                  Midnight Network · Zero-Knowledge
                </span>
              </div>
            </motion.div>

            {/* Headline */}
            <motion.h1
              variants={fadeUp}
              className="text-5xl sm:text-7xl font-black tracking-tighter leading-[0.93] mb-6 text-white"
            >
              <span className="block">Private tickets.</span>
              <span className="block text-zinc-300">Proof on-chain.</span>
            </motion.h1>

            <motion.p
              variants={fadeUp}
              className="text-base sm:text-lg text-zinc-400 max-w-xl mx-auto mb-4 leading-relaxed"
            >
              A full-stack ticketing platform built on{" "}
              <span className="text-white font-medium">Midnight Network</span>.
              Attendees self-claim tickets with a ZK age proof, show a QR at the
              door, and get admitted on-chain — without ever revealing their identity.
            </motion.p>

            {/* CTAs */}
            <motion.div variants={fadeUp} className="flex items-center justify-center gap-3 flex-wrap mt-8">
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
                    Sign in with Google to create events and manage tickets.
                  </p>
                </>
              )}
            </motion.div>

            {/* Stats */}
            <motion.div variants={fadeUp} className="flex items-center justify-center gap-0 mt-14 flex-wrap">
              <StatChip value="ZK" label="Age proofs" />
              <StatChip value="QR" label="Venue admission" />
              <StatChip value="0" label="Identity revealed" />
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
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                </svg>
              }
              title="ZK age gate"
              body="Set a minimum age requirement. Attendees ZK-prove they qualify using only their birth year — no date of birth ever leaves their device."
            />
            <FeatureCard
              icon={
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
                </svg>
              }
              title="Self-service claiming"
              body="No organizer approval needed. Attendees connect their Lace wallet, pass the age check, and receive a private ticket nonce instantly on-chain."
            />
            <FeatureCard
              icon={
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 3.75 9.375v-4.5ZM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 0 1-1.125-1.125v-4.5ZM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 13.5 9.375v-4.5Z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 6.75h.75v.75h-.75v-.75ZM6.75 16.5h.75v.75h-.75v-.75ZM16.5 6.75h.75v.75h-.75v-.75ZM13.5 13.5h.75v.75h-.75v-.75ZM13.5 19.5h.75v.75h-.75v-.75ZM19.5 13.5h.75v.75h-.75v-.75ZM19.5 19.5h.75v.75h-.75v-.75ZM16.5 16.5h.75v.75h-.75v-.75Z" />
                </svg>
              }
              title="QR admission at the door"
              body="Attendees show a QR code encoding their private nonce. The organizer scans it, the contract verifies and marks the ticket used — all on-chain."
            />
            <FeatureCard
              icon={
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
                </svg>
              }
              title="Delegate staff access"
              body="Grant co-organizers a separate on-chain identity so venue staff can scan tickets without ever seeing the organizer's private key."
            />
            <FeatureCard
              icon={
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6" />
                </svg>
              }
              title="Live admission dashboard"
              body="Real-time admitted / claimed counts, per-ticket status, and a Socket.io-powered feed — all updated the moment a QR is scanned."
            />
            <FeatureCard
              icon={
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
                </svg>
              }
              title="Secrets stay local"
              body="Your ticket nonce is generated in-browser and stored only in localStorage. The backend stores only the public on-chain txId — never the nonce."
            />
          </motion.div>
        </section>

        {/* ── HOW IT WORKS ─────────────────────────────────────────── */}
        <section className="mx-auto max-w-4xl px-5 pb-24">
          <Reveal className="mb-10">
            <p className="text-[11px] text-zinc-500 uppercase tracking-widest font-medium mb-2">How it works</p>
            <h2 className="text-2xl font-bold text-white tracking-tight">From creation to admission</h2>
          </Reveal>

          <div className="space-y-0">
            <FlowStep
              n="01"
              role="organizer"
              title="Create your event"
              body="Deploy the ZK contract on Midnight, set name, capacity, min age, and publish rich metadata (location, dates, description) via the platform."
              href="/events/new"
              locked={!connected}
              isLast={false}
            />
            <FlowStep
              n="02"
              role="attendee"
              title="Claim a ticket"
              body="Connect your Lace wallet, provide your birth year as a private witness, and receive a unique ticket nonce committed on-chain — without revealing any personal data."
              href="/events"
              locked={false}
              isLast={false}
            />
            <FlowStep
              n="03"
              role="attendee"
              title="Show your QR at the door"
              body="Open My Tickets and show the QR code. It encodes your private nonce — the only thing the organizer needs to admit you."
              href="/my-tickets"
              locked={false}
              isLast={false}
            />
            <FlowStep
              n="04"
              role="organizer"
              title="Scan & admit on-chain"
              body="Scan the QR with your phone. The contract verifies the ticket is valid and unused, marks it admitted, and the attendee's app updates automatically."
              href="/events"
              locked={!connected}
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
                    title: "Age without a birthday",
                    body: "The age check is a ZK constraint inside the Compact circuit. Only a proof that age ≥ min_age is submitted — the birth year never leaves the browser.",
                  },
                  {
                    title: "Hashes, not identities",
                    body: "Only persistentHash(ticket_nonce) is stored on the Midnight ledger. No names, emails, wallet addresses, or public keys ever touch the contract.",
                  },
                  {
                    title: "Admission without re-identification",
                    body: "The organizer scans a QR that encodes the nonce. The contract checks the hash — and that is all. The attendee is admitted, not identified.",
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

        {/* ── BOTTOM CTA ───────────────────────────────────────────── */}
        {!connected && (
          <section className="mx-auto max-w-4xl px-5 pb-24">
            <Reveal>
              <div className="border border-white/8 bg-white/[0.02] border-shimmer px-8 py-12 text-center">
                <p className="text-xs text-zinc-500 uppercase tracking-widest font-medium mb-4">Get started</p>
                <h2 className="text-2xl font-bold text-white mb-3 tracking-tight">Ready to run privacy-first events?</h2>
                <p className="text-sm text-zinc-400 max-w-sm mx-auto mb-8">
                  Sign in with Google to create events, deploy contracts, and manage admissions.
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
