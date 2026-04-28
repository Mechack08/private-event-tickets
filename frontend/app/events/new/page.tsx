"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { Nav } from "@/components/Nav";
import { EventPlaceholder } from "@/components/EventPlaceholder";
import type { LocationResult } from "@/components/LocationPickerMap";
import { useWallet } from "@/contexts/WalletContext";
import type { AvailableWallet, WalletState } from "@/hooks/useWallet";
import { useAuth } from "@/contexts/AuthContext";
import { saveEvent, saveCallerSecret } from "@/lib/storage";
import { api as backendApi } from "@/lib/api";
import { COUNTRY_NAMES } from "@/lib/countries";

// Map loaded client-side only (Leaflet requires the DOM).
const LocationPickerMap = dynamic(
  () => import("@/components/LocationPickerMap"),
  { ssr: false }
);

// ─── Types ────────────────────────────────────────────────────────────────────

interface FormState {
  eventName:    string;
  totalTickets: string;
  description:  string;
  // Time
  startDate:    string;
  startTime:    string;
  endDate:      string;
  endTime:      string;
  // Location (auto-filled by map or typed manually)
  country:      string;
  city:         string;
  address:      string;
  lat:          number | null;
  lng:          number | null;
}

type ProgressStatus = "idle" | "active" | "done" | "error";

interface ProgressStep {
  id:      string;
  label:   string;
  detail?: string;
  status:  ProgressStatus;
}

interface DeploySuccess {
  contractAddress:  string;
  eventName:        string;
  backendSyncFailed?: boolean;
}

interface PreflightState {
  phase:       "connecting" | "ready" | "error";
  walletName:  string;
  walletIcon?: string;
  dustBalance: bigint | null;
  dustCap:     bigint | null;
  dustAddress: string | null;
  error:       string | null;
}

/** Connected wallet type — avoids importing dapp-connector-api directly in the page. */
type ConnectedWallet = Awaited<ReturnType<WalletState["connect"]>>;

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * 1 DUST = 1,000,000 raw units (6 decimal places — Cardano/Midnight convention).
 * getDustBalance() always returns raw units.
 */
const DUST_SCALE = 1_000_000n;

/** Estimated raw-unit cost of contract deploy + createEvent ZK transaction (~0.5 DUST). */
const DEPLOY_COST_ESTIMATE = 500_000n;

/** Convert raw DUST units to a human-readable string (e.g. 1_500_000_000_000n → "1.5B"). */
function formatDust(rawN: bigint): string {
  const d = Number(rawN) / Number(DUST_SCALE); // value in DUST (float)
  if (d >= 1e9)  return (d / 1e9).toLocaleString(undefined, { maximumFractionDigits: 2 }) + "B";
  if (d >= 1e6)  return (d / 1e6).toLocaleString(undefined, { maximumFractionDigits: 2 }) + "M";
  if (d >= 1e3)  return (d / 1e3).toLocaleString(undefined, { maximumFractionDigits: 1 }) + "K";
  return d.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

const WIZARD_STEPS = [
  { label: "Core",    sub: "on-chain"  },
  { label: "Details", sub: "off-chain" },
  { label: "Review",  sub: "deploy"    },
] as const;

const INITIAL_PROGRESS: ProgressStep[] = [
  { id: "deploy",  label: "Deploying contract",          status: "active" },
  { id: "circuit", label: "Initialising on-chain state", status: "idle"   },
  { id: "key",     label: "Saving organizer key",        status: "idle"   },
  { id: "backend", label: "Registering metadata",        status: "idle"   },
];

// ─── Shared helpers ───────────────────────────────────────────────────────────

function Spinner({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      className="animate-spin shrink-0">
      <circle className="opacity-20" cx="12" cy="12" r="10"
        stroke="currentColor" strokeWidth="3" />
      <path className="opacity-80" fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

function CheckSm() {
  return (
    <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor"
      strokeWidth={2.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

const inputCls =
  "w-full bg-white/[0.03] border border-white/8 px-4 py-3 text-sm text-white " +
  "placeholder-zinc-700 focus:outline-none focus:border-white/25 " +
  "disabled:opacity-40 transition-colors rounded-none";

// ─── Wallet pre-flight modal ─────────────────────────────────────────────────
// Shown after wallet selection: connects the wallet, fetches DUST balance,
// and asks the user to confirm before starting the (slow) deploy flow.

function WalletPreflightModal({
  state, onConfirm, onCancel,
}: {
  state: PreflightState;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const hasBalance  = state.dustBalance !== null;
  const sufficient  = !hasBalance || state.dustBalance! >= DEPLOY_COST_ESTIMATE;
  // Bar fills to 100% when balance = 3× estimated cost.
  const pct = hasBalance
    ? Math.min(100, Number((state.dustBalance! * 100n) / (DEPLOY_COST_ESTIMATE * 3n)))
    : 0;
  const barColor = pct > 66 ? "bg-emerald-500" : pct > 33 ? "bg-amber-500" : "bg-red-500";
  const truncAddr = state.dustAddress
    ? state.dustAddress.slice(0, 14) + "…" + state.dustAddress.slice(-8)
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div className="w-full max-w-sm border border-white/10 bg-[#0d0d0d] overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-white/8">
          {state.walletIcon ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={state.walletIcon} alt="" className="w-9 h-9 shrink-0 rounded-lg" />
          ) : (
            <div className="w-9 h-9 shrink-0 border border-white/10 bg-white/[0.04] flex items-center justify-center">
              <svg className="w-4.5 h-4.5 text-zinc-500" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6" />
              </svg>
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-[9px] font-mono font-semibold text-zinc-700 uppercase tracking-widest">Wallet</p>
            <p className="text-sm font-semibold text-white truncate">{state.walletName}</p>
          </div>
          {state.phase === "connecting" && (
            <span className="shrink-0 flex items-center gap-1.5 text-[10px] font-mono text-zinc-500">
              <Spinner size={11} /> Connecting
            </span>
          )}
          {state.phase === "ready" && (
            <span className="shrink-0 flex items-center gap-1.5 text-[10px] font-mono text-emerald-400 border border-emerald-500/20 bg-emerald-500/[0.04] px-2 py-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Connected
            </span>
          )}
          {state.phase === "error" && (
            <span className="shrink-0 text-[10px] font-mono text-red-400">Failed</span>
          )}
        </div>

        <div className="px-5 py-5">
          {/* ── Connecting phase ── */}
          {state.phase === "connecting" && (
            <div className="py-6 text-center space-y-4">
              <div className="inline-flex w-14 h-14 border border-white/8 bg-white/[0.02] items-center justify-center mx-auto">
                <Spinner size={22} />
              </div>
              <div>
                <p className="text-sm font-medium text-zinc-200 mb-1">Awaiting wallet approval</p>
                <p className="text-xs text-zinc-600 leading-relaxed">
                  The wallet extension popup may be waiting behind this window. Check your browser toolbar.
                </p>
              </div>
            </div>
          )}

          {/* ── Error phase ── */}
          {state.phase === "error" && (
            <div className="py-2 flex items-start gap-3 border border-red-500/20 bg-red-500/[0.04] px-4 py-3">
              <svg className="w-4 h-4 text-red-400 mt-0.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
              <p className="text-xs text-zinc-400 leading-relaxed">{state.error}</p>
            </div>
          )}

          {/* ── Ready phase ── */}
          {state.phase === "ready" && (
            <div className="space-y-4">

              {/* Shielded address */}
              {truncAddr && (
                <div>
                  <p className="text-[9px] font-mono font-semibold text-zinc-700 uppercase tracking-widest mb-1.5">Shielded address</p>
                  <p className="text-[11px] font-mono text-zinc-400 bg-white/[0.03] border border-white/6 px-3 py-2 truncate">
                    {truncAddr}
                  </p>
                </div>
              )}

              {/* DUST balance */}
              <div>
                <div className="flex items-baseline justify-between mb-1.5">
                  <p className="text-[9px] font-mono font-semibold text-zinc-700 uppercase tracking-widest">DUST Balance</p>
                  {hasBalance ? (
                    <p className="text-sm font-bold text-white tabular-nums">
                      {formatDust(state.dustBalance!)}
                      <span className="text-[10px] font-mono text-zinc-600 ml-1">DUST</span>
                    </p>
                  ) : (
                    <p className="text-xs text-zinc-600">unavailable</p>
                  )}
                </div>
                {/* Gauge */}
                <div className="h-1 bg-white/[0.04] border border-white/6 mb-1 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-700 ease-out ${barColor}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                {state.dustCap !== null && (
                  <p className="text-[9px] font-mono text-zinc-800">Cap: {formatDust(state.dustCap!)} DUST</p>
                )}
              </div>

              {/* Cost / status row */}
              <div className="border border-white/6 bg-white/[0.015] divide-y divide-white/6">
                <div className="flex items-center justify-between px-4 py-2.5">
                  <p className="text-xs text-zinc-500">Estimated deploy cost</p>
                  <p className="text-xs font-mono text-zinc-400">~{formatDust(DEPLOY_COST_ESTIMATE)} DUST</p>
                </div>
                <div className="flex items-center justify-between px-4 py-2.5">
                  <p className="text-xs text-zinc-500">Status</p>
                  {!hasBalance ? (
                    <span className="text-[10px] font-mono text-zinc-600">—</span>
                  ) : sufficient ? (
                    <span className="flex items-center gap-1 text-[10px] font-mono text-emerald-400">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      Sufficient
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[10px] font-mono text-amber-400">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                      </svg>
                      Low balance
                    </span>
                  )}
                </div>
              </div>

              {!sufficient && hasBalance && (
                <p className="flex items-start gap-2 text-[11px] text-amber-300/60 bg-amber-500/[0.04] border border-amber-500/15 px-3 py-2.5 leading-relaxed">
                  <svg className="w-3.5 h-3.5 mt-0.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                  </svg>
                  Balance may be too low. The transaction might fail. Earn more DUST from NIGHT staking before proceeding.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-5 pb-5">
          {state.phase === "ready" && (
            <button
              onClick={onConfirm}
              className="flex-1 bg-white text-black text-sm font-semibold py-3 hover:bg-zinc-100 transition-colors"
            >
              Deploy Contract →
            </button>
          )}
          <button
            onClick={onCancel}
            className={[
              "text-sm text-zinc-500 hover:text-white border border-white/8 hover:border-white/20 py-3 transition-colors",
              state.phase === "ready" ? "px-5" : "flex-1",
            ].join(" ")}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Wallet picker modal ─────────────────────────────────────────────────────

function WalletPickerModal({
  wallets, onPick, onCancel,
}: {
  wallets: AvailableWallet[];
  onPick: (key: string) => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-sm border border-white/10 bg-[#0f0f0f] p-6">
        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-1">Connect wallet</p>
        <h2 className="text-base font-bold text-white mb-5">Select a Midnight wallet</h2>
        <div className="space-y-2 mb-5">
          {wallets.map((w) => (
            <button
              key={w.key}
              onClick={() => onPick(w.key)}
              className="w-full flex items-center gap-3 border border-white/8 bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/20 px-4 py-3.5 text-left transition-colors"
            >
              {w.icon ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={w.icon} alt="" className="w-6 h-6 shrink-0 rounded" />
              ) : (
                <div className="w-6 h-6 shrink-0 bg-white/5 border border-white/10 flex items-center justify-center">
                  <svg className="w-3.5 h-3.5 text-zinc-600" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18-3a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6m18 0V6m0 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6" />
                  </svg>
                </div>
              )}
              <span className="text-sm font-medium text-white">{w.name}</span>
            </button>
          ))}
        </div>
        <button
          onClick={onCancel}
          className="w-full text-xs text-zinc-600 hover:text-zinc-400 transition-colors py-1"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Stepper ──────────────────────────────────────────────────────────────────

function Stepper({ current }: { current: number }) {
  return (
    <div className="flex items-center mb-10">
      {WIZARD_STEPS.map((s, i) => (
        <div key={i} className="contents">
          <div className="flex flex-col items-center gap-1 shrink-0">
            <div className={[
              "w-7 h-7 flex items-center justify-center text-[11px] font-bold border transition-all duration-200",
              i === current
                ? "bg-white text-black border-white"
                : i < current
                ? "bg-white/[0.07] text-zinc-400 border-white/20"
                : "bg-transparent text-zinc-700 border-white/8",
            ].join(" ")}>
              {i < current
                ? <CheckSm />
                : <span className="font-mono tabular-nums">{String(i + 1).padStart(2, "0")}</span>
              }
            </div>
            <div className="text-center">
              <p className={`text-[9px] font-semibold uppercase tracking-widest ${i === current ? "text-zinc-300" : "text-zinc-700"}`}>
                {s.label}
              </p>
              <p className="text-[8px] font-mono text-zinc-800">{s.sub}</p>
            </div>
          </div>
          {i < WIZARD_STEPS.length - 1 && (
            <div className={`flex-1 h-px mx-4 mb-5 transition-colors duration-300 ${i < current ? "bg-white/20" : "bg-white/6"}`} />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Field wrapper ────────────────────────────────────────────────────────────

function Field({
  id, label, badge, hint, optional, children,
}: {
  id: string; label: string; badge?: string; hint?: string;
  optional?: boolean; children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <label htmlFor={id} className="text-xs font-medium text-zinc-400">{label}</label>
        {badge && (
          <span className="text-[10px] font-mono text-zinc-700 border border-white/6 px-1.5 py-0.5 leading-none">
            {badge}
          </span>
        )}
        {optional && <span className="text-[10px] text-zinc-700 italic">optional</span>}
      </div>
      {children}
      {hint && <p className="text-[10px] text-zinc-700 mt-1.5 leading-relaxed">{hint}</p>}
    </div>
  );
}

// ─── Deploy overlay ───────────────────────────────────────────────────────────
// Full-screen cinematic animation shown while the ZK contract is deploying.

const STEP_META: Record<string, { icon: string; tagline: string; color: string }> = {
  deploy:  { icon: "◈", tagline: "Weaving the contract into the ledger…",   color: "#a78bfa" },
  circuit: { icon: "⬡", tagline: "Constructing the ZK state machine…",      color: "#38bdf8" },
  key:     { icon: "⊕", tagline: "Sealing the organizer commitment…",        color: "#34d399" },
  backend: { icon: "◎", tagline: "Synchronising with the event index…",      color: "#fb923c" },
};

function useCountUp(target: number, duration: number) {
  const mv = useMotionValue(0);
  const rounded = useTransform(mv, Math.round);
  useEffect(() => {
    const ctrl = animate(mv, target, { duration, ease: "easeOut" });
    return ctrl.stop;
  }, [target, duration, mv]);
  return rounded;
}

/** Animated floating particle for the background. */
function Particle({ delay, x, size, opacity }: { delay: number; x: string; size: number; opacity: number }) {
  return (
    <motion.div
      className="absolute rounded-full pointer-events-none"
      style={{ left: x, width: size, height: size, background: "white", opacity }}
      initial={{ bottom: "-10%", scale: 0 }}
      animate={{ bottom: "110%", scale: [0, 1, 0.8, 0] }}
      transition={{ duration: 6 + Math.random() * 4, delay, repeat: Infinity, ease: "easeOut" }}
    />
  );
}

function DeployOverlay({
  steps, eventName,
}: {
  steps: ProgressStep[];
  eventName: string;
}) {
  const activeStep = steps.find((s) => s.status === "active");
  const doneCount  = steps.filter((s) => s.status === "done").length;
  const pct        = Math.round((doneCount / steps.length) * 100);
  const countUp    = useCountUp(pct, 0.7);
  const meta       = activeStep ? (STEP_META[activeStep.id] ?? STEP_META.deploy) : STEP_META.backend;

  const particles = useMemo(() =>
    Array.from({ length: 14 }, (_, i) => ({
      id: i,
      delay: i * 0.4,
      x: `${5 + (i * 6.5) % 90}%`,
      size: 2 + (i % 4),
      opacity: 0.04 + (i % 5) * 0.012,
    })), []);

  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden"
      style={{ background: "#060606" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
    >
      {/* Ambient background glow */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        animate={{ opacity: [0.3, 0.6, 0.3] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        style={{
          background: `radial-gradient(ellipse 60% 40% at 50% 60%, ${meta.color}18 0%, transparent 70%)`,
        }}
      />

      {/* Floating particles */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {particles.map((p) => <Particle key={p.id} {...p} />)}
      </div>

      {/* Grid overlay */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage: "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      {/* ── Main content ── */}
      <div className="relative flex flex-col items-center gap-10 px-6 max-w-sm w-full text-center">

        {/* Animated sigil / icon */}
        <div className="relative">
          {/* Outer spinning ring */}
          <motion.div
            className="absolute inset-0 rounded-full border border-white/5"
            style={{ margin: -24 }}
            animate={{ rotate: 360 }}
            transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          />
          {/* Middle dashed ring */}
          <motion.svg
            className="absolute pointer-events-none"
            style={{ width: 120, height: 120, top: "50%", left: "50%", transform: "translate(-60px,-60px)" }}
            viewBox="0 0 120 120"
            animate={{ rotate: -360 }}
            transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
          >
            <circle cx="60" cy="60" r="55" fill="none" stroke={meta.color} strokeWidth="0.5"
              strokeDasharray="8 14" strokeOpacity="0.25" />
          </motion.svg>
          {/* Inner pulsing disc */}
          <motion.div
            className="relative w-20 h-20 flex items-center justify-center border"
            style={{ borderColor: `${meta.color}30`, background: `${meta.color}08` }}
            animate={{ boxShadow: [`0 0 0px ${meta.color}00`, `0 0 30px ${meta.color}30`, `0 0 0px ${meta.color}00`] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
          >
            <AnimatePresence mode="wait">
              <motion.span
                key={activeStep?.id ?? "idle"}
                className="text-3xl select-none"
                style={{ color: meta.color }}
                initial={{ opacity: 0, scale: 0.5, rotate: -90 }}
                animate={{ opacity: 1, scale: 1, rotate: 0 }}
                exit={{ opacity: 0, scale: 1.4, rotate: 90 }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              >
                {meta.icon}
              </motion.span>
            </AnimatePresence>
          </motion.div>
        </div>

        {/* Event name */}
        <div className="space-y-1.5">
          <p className="text-[10px] font-mono font-semibold text-zinc-700 uppercase tracking-[0.2em]">Deploying</p>
          <h2 className="text-xl font-bold text-white tracking-tight truncate max-w-xs">{eventName || "Your Event"}</h2>
        </div>

        {/* Tagline */}
        <AnimatePresence mode="wait">
          <motion.p
            key={activeStep?.id ?? "idle"}
            className="text-xs text-zinc-600 leading-relaxed h-8"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.35 }}
          >
            {meta.tagline}
          </motion.p>
        </AnimatePresence>

        {/* Progress bar */}
        <div className="w-full space-y-2">
          <div className="h-px bg-white/[0.04] w-full overflow-hidden relative">
            <motion.div
              className="absolute left-0 top-0 h-full"
              style={{ background: `linear-gradient(90deg, ${meta.color}80, ${meta.color})` }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.7, ease: "easeOut" }}
            />
            {/* Shimmer */}
            <motion.div
              className="absolute top-0 h-full w-20 pointer-events-none"
              style={{ background: `linear-gradient(90deg, transparent, ${meta.color}60, transparent)` }}
              animate={{ left: ["-80px", "110%"] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut", repeatDelay: 0.5 }}
            />
          </div>
          <div className="flex justify-between items-baseline">
            <motion.p className="text-[10px] font-mono text-zinc-700" style={{ color: meta.color }}>
              {countUp}%
            </motion.p>
            <p className="text-[10px] font-mono text-zinc-800">{doneCount}/{steps.length} steps</p>
          </div>
        </div>

        {/* Step list */}
        <div className="w-full space-y-2">
          {steps.map((s, i) => {
            const m = STEP_META[s.id] ?? STEP_META.deploy;
            return (
              <motion.div
                key={s.id}
                className="flex items-center gap-3"
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.08, duration: 0.3 }}
              >
                {/* State dot */}
                <div className="w-4 h-4 shrink-0 flex items-center justify-center">
                  {s.status === "done" && (
                    <motion.svg
                      className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"
                      style={{ color: m.color }}
                      initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: "spring", stiffness: 400, damping: 15 }}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </motion.svg>
                  )}
                  {s.status === "active" && (
                    <motion.div
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ background: m.color }}
                      animate={{ scale: [1, 1.6, 1], opacity: [1, 0.5, 1] }}
                      transition={{ duration: 1.2, repeat: Infinity }}
                    />
                  )}
                  {s.status === "idle" && (
                    <div className="w-1 h-1 rounded-full bg-zinc-800" />
                  )}
                  {s.status === "error" && (
                    <svg className="w-3 h-3 text-red-500" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  )}
                </div>
                <p className={`text-xs transition-colors ${
                  s.status === "active" ? "text-white font-medium"
                  : s.status === "done"  ? "text-zinc-600"
                  : s.status === "error" ? "text-red-400"
                  : "text-zinc-800"
                }`}>
                  {s.label}
                </p>
                {s.status === "active" && (
                  <motion.div
                    className="flex-1 h-px ml-1"
                    style={{ background: `linear-gradient(90deg, ${m.color}50, transparent)` }}
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  />
                )}
              </motion.div>
            );
          })}
        </div>

        <p className="text-[10px] font-mono text-zinc-800 tracking-widest mt-2">
          DO NOT CLOSE THIS TAB
        </p>
      </div>
    </motion.div>
  );
}

// ─── Deploy progress row (kept for non-loading display in ReviewStep) ─────────

function ProgressRow({ step }: { step: ProgressStep }) {
  return (
    <motion.div layout className="flex items-start gap-3">
      <div className="mt-0.5 w-5 h-5 flex items-center justify-center shrink-0">
        {step.status === "done"   && <CheckSm />}
        {step.status === "active" && <Spinner size={13} />}
        {step.status === "error"  && (
          <svg className="w-3.5 h-3.5 text-red-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        )}
        {step.status === "idle" && <div className="w-1.5 h-1.5 rounded-full bg-zinc-700 mx-auto" />}
      </div>
      <div className="flex-1 min-w-0 pb-0.5">
        <p className={`text-sm leading-none ${
          step.status === "active" ? "text-white"
          : step.status === "done"  ? "text-zinc-500"
          : step.status === "error" ? "text-red-400"
          : "text-zinc-700"
        }`}>
          {step.label}
        </p>
        {step.detail && step.status === "done" && (
          <p className="text-[11px] font-mono text-zinc-700 mt-1 truncate">{step.detail}</p>
        )}
      </div>
    </motion.div>
  );
}

// ─── Step 0 — Core (on-chain) ─────────────────────────────────────────────────

function Step0({
  form, onChange, onNext,
}: {
  form: FormState;
  onChange: (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) => void;
  onNext: () => void;
}) {
  const canContinue = form.eventName.trim().length > 0 && parseInt(form.totalTickets) >= 1;

  return (
    <div className="space-y-6">
      <div className="mb-2">
        <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest mb-2">Step 1 of 3</p>
        <h2 className="text-lg font-bold text-white mb-1">What are you creating?</h2>
        <p className="text-sm text-zinc-600 leading-relaxed">
          These two values are committed permanently to the Midnight ledger and cannot be changed after deploy.
        </p>
      </div>

      <Field id="eventName" label="Event name" badge="Bytes<32>"
        hint="Encoded as 32-byte UTF-8 on-chain. Max 32 characters.">
        <input id="eventName" type="text" placeholder="e.g. ZK Summit 2026"
          value={form.eventName} onChange={onChange("eventName")}
          maxLength={32} required className={inputCls} />
      </Field>

      <Field id="totalTickets" label="Max capacity" badge="Uint<32>"
        hint="Maximum tickets ever issued. Permanent — choose carefully.">
        <input id="totalTickets" type="number" min={1} max={4294967295}
          value={form.totalTickets} onChange={onChange("totalTickets")}
          required className={inputCls} />
      </Field>

      <button type="button" onClick={onNext} disabled={!canContinue}
        className="w-full bg-white text-black text-sm font-semibold py-3 hover:bg-zinc-100 disabled:opacity-25 disabled:cursor-not-allowed transition-colors mt-2">
        Next: Details →
      </button>
    </div>
  );
}

// ─── Step 1 — Details (off-chain) ────────────────────────────────────────────

function Step1({
  form, onChange, onTextAreaChange, onLocation, onCountryChange, mapFlyQuery, onBack, onNext,
}: {
  form: FormState;
  onChange: (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) => void;
  onTextAreaChange: (key: keyof FormState) => (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onLocation: (r: LocationResult) => void;
  /** Called when the country field changes; triggers map fly for full names. */
  onCountryChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  /** Forward-geocode query forwarded to the map (full country name). */
  mapFlyQuery: string;
  onBack: () => void;
  onNext: () => void;
}) {
  const canContinue =
    form.description.trim().length > 0 &&
    form.startDate && form.startTime &&
    form.endDate && form.endTime &&
    (form.city.trim().length > 0 || form.address.trim().length > 0);

  // Warn if end is before start.
  const endBeforeStart =
    form.startDate && form.endDate && form.startTime && form.endTime
      ? new Date(`${form.endDate}T${form.endTime}`) <= new Date(`${form.startDate}T${form.startTime}`)
      : false;

  return (
    <div className="space-y-6">
      <div className="mb-2">
        <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest mb-2">Step 2 of 3</p>
        <h2 className="text-lg font-bold text-white mb-1">Describe the event</h2>
        <p className="text-sm text-zinc-600 leading-relaxed">
          Off-chain metadata — stored in the backend and editable later.
        </p>
      </div>

      <Field id="description" label="Description">
        <textarea id="description"
          placeholder="Tell attendees what this event is about…"
          value={form.description}
          onChange={onTextAreaChange("description")}
          rows={4} maxLength={5000} required
          className={`${inputCls} resize-none`} />
      </Field>

      {/* ── Date & Time ─────────────────────────────────────────────── */}
      <div className="space-y-3">
        <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest">Schedule</p>

        <div className="grid grid-cols-2 gap-3">
          <Field id="startDate" label="Start date">
            <input id="startDate" type="date" value={form.startDate}
              min={new Date().toISOString().slice(0, 10)}
              onChange={onChange("startDate")} required className={inputCls} />
          </Field>
          <Field id="startTime" label="Start time (local)">
            <input id="startTime" type="time" value={form.startTime}
              onChange={onChange("startTime")} required className={inputCls} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field id="endDate" label="End date">
            <input id="endDate" type="date" value={form.endDate}
              min={form.startDate || new Date().toISOString().slice(0, 10)}
              onChange={onChange("endDate")} required className={inputCls} />
          </Field>
          <Field id="endTime" label="End time (local)">
            <input id="endTime" type="time" value={form.endTime}
              onChange={onChange("endTime")} required className={inputCls} />
          </Field>
        </div>

        {endBeforeStart && (
          <p className="flex items-center gap-1.5 text-[11px] text-amber-400">
            <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
            End must be after start.
          </p>
        )}
      </div>

      {/* ── Location ─────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest">Location</p>

        {/* Map — click to pin / use location / country flies map */}
        <LocationPickerMap
          onLocation={onLocation}
          initialLat={form.lat ?? 48.8566}
          initialLng={form.lng ?? 2.3522}
          flyToQuery={mapFlyQuery}
        />

        <div className="grid grid-cols-2 gap-3">
          <Field id="country" label="Country"
            hint="Auto-filled from map. Selecting a country focuses the map.">
            <input id="country" type="text" placeholder="e.g. France"
              value={form.country} onChange={onCountryChange}
              list="country-list" className={inputCls} />
            <datalist id="country-list">
              {COUNTRY_NAMES.map((c) => <option key={c} value={c} />)}
            </datalist>
          </Field>
          <Field id="city" label="City">
            <input id="city" type="text" placeholder="e.g. Paris"
              value={form.city} onChange={onChange("city")} className={inputCls} />
          </Field>
        </div>

        <Field id="address" label="Full address" optional
          hint="Auto-populated from map pin. You can edit it.">
          <input id="address" type="text"
            placeholder="Street, district, postcode…"
            value={form.address} onChange={onChange("address")}
            className={inputCls} />
        </Field>
      </div>

      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onBack}
          className="border border-white/8 text-zinc-500 text-sm px-5 py-3 hover:text-white hover:border-white/20 transition-colors">
          ← Back
        </button>
        <button type="button" onClick={onNext}
          disabled={!canContinue || endBeforeStart}
          className="flex-1 bg-white text-black text-sm font-semibold py-3 hover:bg-zinc-100 disabled:opacity-25 disabled:cursor-not-allowed transition-colors">
          Review →
        </button>
      </div>
    </div>
  );
}

// ─── Step 2 — Review & Deploy ─────────────────────────────────────────────────

function ReviewStep({
  form, progress, loading, error,
  onBack, onDeploy, onDismissError,
}: {
  form: FormState;
  progress: ProgressStep[];
  loading: boolean;
  error: string | null;
  onBack: () => void;
  onDeploy: () => void;
  onDismissError: () => void;
}) {
  const fmt = (d: string, t: string) =>
    d && t
      ? new Date(`${d}T${t}`).toLocaleString(undefined, {
          weekday: "short", year: "numeric", month: "long",
          day: "numeric", hour: "2-digit", minute: "2-digit",
        })
      : "—";

  const locationDisplay =
    form.city && form.country ? `${form.city}, ${form.country}`
    : form.address || "—";

  const rows: { label: string; value: string; tag?: string }[] = [
    { label: "Event name",   value: form.eventName || "—",                  tag: "on-chain"  },
    { label: "Capacity",     value: `${form.totalTickets} tickets`,          tag: "on-chain"  },
    { label: "Starts",       value: fmt(form.startDate, form.startTime),     tag: "off-chain" },
    { label: "Ends",         value: fmt(form.endDate,   form.endTime),       tag: "off-chain" },
    { label: "Location",     value: locationDisplay,                         tag: "off-chain" },
    { label: "Description",  value: form.description.length > 90
        ? form.description.slice(0, 90) + "…"
        : form.description,                                                  tag: "off-chain" },
  ];

  return (
    <div className="space-y-6">
      <div className="mb-2">
        <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest mb-2">Step 3 of 3</p>
        <h2 className="text-lg font-bold text-white mb-1">Review &amp; Deploy</h2>
        <p className="text-sm text-zinc-600 leading-relaxed">
          Confirm everything. On-chain fields are permanent after deploy.
        </p>
      </div>

      <div className="border border-white/8 divide-y divide-white/6">
        {rows.map(({ label, value, tag }) => (
          <div key={label} className="flex items-start gap-3 px-4 py-3">
            <div className="w-28 shrink-0 pt-0.5">
              <p className="text-[11px] font-medium text-zinc-600">{label}</p>
              {tag && (
                <span className={`inline-block text-[8px] font-mono font-semibold px-1 py-0.5 leading-tight mt-0.5 ${
                  tag === "on-chain"
                    ? "text-white/35 bg-white/[0.06]"
                    : "text-zinc-700 bg-white/[0.03]"
                }`}>
                  {tag}
                </span>
              )}
            </div>
            <p className="text-sm text-zinc-300 flex-1 leading-relaxed break-words">{value}</p>
          </div>
        ))}
      </div>

      {!loading && !error ? (
        <div className="flex gap-3">
          <button type="button" onClick={onBack} disabled={loading}
            className="border border-white/8 text-zinc-500 text-sm px-5 py-3 hover:text-white hover:border-white/20 transition-colors disabled:opacity-30">
            ← Back
          </button>
          <button type="button" onClick={onDeploy}
            className="flex-1 bg-white text-black text-sm font-semibold py-3 hover:bg-zinc-100 transition-colors">
            Deploy &amp; Create Event
          </button>
        </div>
      ) : null}

      <AnimatePresence>
        {error && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="border border-red-500/30 bg-red-500/[0.05] px-4 py-4">
              <p className="text-sm font-semibold text-red-400 mb-1">Deployment failed</p>
              <p className="text-xs text-zinc-500 leading-relaxed">{error}</p>
              <button type="button" onClick={onDismissError}
                className="text-xs text-zinc-500 hover:text-white mt-3 underline underline-offset-2 transition-colors">
                Dismiss and retry
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Key warning panel ────────────────────────────────────────────────────────

function KeyWarningPanel() {
  return (
    <div className="border border-amber-500/25 bg-amber-500/[0.04] p-5">
      <div className="flex items-start gap-3">
        <svg className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" fill="none"
          stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
        </svg>
        <div className="space-y-2">
          <p className="text-sm font-semibold text-amber-400">Organizer key</p>
          <p className="text-xs text-zinc-500 leading-relaxed">
            After deploy, <code className="text-zinc-400 font-mono text-[11px]">callerSecretHex</code> is
            saved automatically in this browser — the only preimage to the on-chain organizer hash.
          </p>
          <p className="text-xs text-zinc-600 leading-relaxed">
            <span className="text-zinc-500 font-medium">Losing it makes the event permanently
            unmanageable</span> — no issue, pause, cancel, or delegates are possible.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Success screen ───────────────────────────────────────────────────────────

function SuccessScreen({
  result, form, onManage, onRetryBackend,
}: {
  result: DeploySuccess;
  form: FormState;
  onManage: () => void;
  onRetryBackend?: () => void;
}) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(result.contractAddress).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  }

  return (
    <motion.div key="success" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }} className="space-y-4">

      <div className="border border-white/8 bg-white/[0.025] p-7">
        <div className="flex items-center gap-3 mb-7">
          <div className="w-9 h-9 bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center shrink-0">
            <CheckSm />
          </div>
          <div>
            <p className="text-base font-semibold text-white">Event deployed</p>
            <p className="text-xs text-zinc-500 mt-0.5">Contract initialised on Midnight preprod.</p>
          </div>
        </div>

        <div className="mb-4 px-4 py-3 bg-white/[0.03] border border-white/6">
          <p className="text-[10px] font-medium text-zinc-600 uppercase tracking-widest mb-1.5">Event</p>
          <p className="text-sm font-semibold text-white">{result.eventName}</p>
        </div>

        <div className="mb-4 px-4 py-3 bg-white/[0.03] border border-white/6">
          <p className="text-[10px] font-medium text-zinc-600 uppercase tracking-widest mb-2">Contract address</p>
          <div className="flex items-start gap-2">
            <code className="text-[11px] font-mono text-zinc-300 flex-1 break-all leading-relaxed">
              {result.contractAddress}
            </code>
            <button onClick={copy}
              className="shrink-0 text-[11px] text-zinc-500 hover:text-white border border-white/8 hover:border-white/20 px-2.5 py-1.5 transition-colors mt-0.5">
              {copied ? "✓ Copied" : "Copy"}
            </button>
          </div>
        </div>

        <div className="mb-7 px-4 py-3.5 bg-emerald-500/[0.04] border border-emerald-500/20">
          <div className="flex items-start gap-2.5">
            <svg className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" fill="none"
              stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
            <div>
              <p className="text-sm font-semibold text-emerald-400">Organizer key saved</p>
              <p className="text-xs text-zinc-500 mt-0.5">
                Stored in <code className="font-mono text-[11px]">localStorage</code> — keep this browser to manage the event.
              </p>
            </div>
          </div>
        </div>

        {result.backendSyncFailed && (
          <div className="mb-4 px-4 py-3 bg-yellow-500/[0.06] border border-yellow-500/25 flex items-start gap-2.5">
            <svg className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" fill="none"
              stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-yellow-400">Event not yet in the public list</p>
              <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">
                The contract is live on-chain, but saving metadata to the backend failed.
                Your event is stored in this browser and visible in{" "}
                <Link href="/my-tickets" className="underline hover:text-zinc-400">My Tickets</Link>.
                {onRetryBackend && (
                  <button onClick={onRetryBackend}
                    className="ml-2 underline text-zinc-400 hover:text-white transition-colors">
                    Retry sync →
                  </button>
                )}
              </p>
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <button onClick={onManage}
            className="flex-1 bg-white text-black text-sm font-semibold py-3 hover:bg-zinc-100 transition-colors">
            Manage Event →
          </button>
          <Link href="/events"
            className="flex items-center border border-white/8 text-zinc-400 text-sm px-5 py-3 hover:text-white hover:border-white/20 transition-colors">
            All Events
          </Link>
        </div>
      </div>

      <div className="border border-amber-500/20 bg-amber-500/[0.03] px-4 py-3 flex items-start gap-2.5">
        <svg className="w-3.5 h-3.5 text-amber-500/70 mt-0.5 shrink-0" fill="none"
          stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
        </svg>
        <p className="text-xs text-zinc-600 leading-relaxed">
          Do not clear <code className="font-mono text-[11px] text-zinc-500">localStorage</code> without
          first exporting your organizer key from the event management page.
        </p>
      </div>

      <EventPlaceholder name={form.eventName} />
    </motion.div>
  );
}

// ─── Animation variants ───────────────────────────────────────────────────────

const stepVariants = {
  enter:  (dir: number) => ({ opacity: 0, x: dir > 0 ?  32 : -32 }),
  center: {
    opacity: 1, x: 0,
    transition: { duration: 0.32, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
  },
  exit: (dir: number) => ({
    opacity: 0, x: dir > 0 ? -32 :  32,
    transition: { duration: 0.18, ease: "easeIn" },
  }),
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NewEventPage() {
  const router      = useRouter();
  const queryClient = useQueryClient();
  const { wallet, connect } = useWallet();
  const { user: authUser }  = useAuth();

  const [form, setForm] = useState<FormState>({
    eventName: "", totalTickets: "100",
    description: "",
    startDate: "", startTime: "18:00",
    endDate:   "", endTime:   "21:00",
    country: "", city: "", address: "",
    lat: null, lng: null,
  });

  const [step,         setStep]        = useState(0);
  const [dir,          setDir]         = useState(1);
  const [progress,     setProgress]    = useState<ProgressStep[]>([]);
  const [loading,      setLoading]     = useState(false);
  const [error,        setError]       = useState<string | null>(null);
  const [success,      setSuccess]     = useState<DeploySuccess | null>(null);
  // Forwarded to LocationPickerMap to fly to a country on selection.
  const [mapFlyQuery,  setMapFlyQuery] = useState("");
  // Wallet picker — shown when multiple Midnight wallets are detected.
  const [walletChoices, setWalletChoices] = useState<AvailableWallet[] | null>(null);
  const walletPickerResolveRef = useRef<((key: string | null) => void) | null>(null);

  function requestWalletPick(choices: AvailableWallet[]): Promise<string | null> {
    return new Promise((resolve) => {
      walletPickerResolveRef.current = resolve;
      setWalletChoices(choices);
    });
  }

  function onWalletChosen(key: string | null) {
    setWalletChoices(null);
    walletPickerResolveRef.current?.(key);
    walletPickerResolveRef.current = null;
  }

  // Wallet pre-flight — connects wallet, fetches balance, waits for user confirmation.
  const [preflight, setPreflight] = useState<PreflightState | null>(null);
  const preflightWalletRef = useRef<ConnectedWallet | null>(null);
  const preflightResolveRef = useRef<((w: ConnectedWallet | null) => void) | null>(null);

  function launchPreflight(
    walletKey: string,
    walletName: string,
    walletIcon?: string,
  ): Promise<ConnectedWallet | null> {
    return new Promise((resolve) => {
      preflightResolveRef.current = resolve;
      setPreflight({ phase: "connecting", walletName, walletIcon, dustBalance: null, dustCap: null, dustAddress: null, error: null });

      // Fire-and-forget: connect in the background while the modal is open.
      connect(walletKey)
        .then(async (connected) => {
          preflightWalletRef.current = connected;
          try {
            const [{ balance, cap }, { shieldedAddress }] = await Promise.all([
              connected.getDustBalance(),
              connected.getShieldedAddresses(),
            ]);
            setPreflight((p) => p ? { ...p, phase: "ready", dustBalance: balance, dustCap: cap, dustAddress: shieldedAddress } : null);
          } catch {
            // Balance unavailable — still allow deploy
            setPreflight((p) => p ? { ...p, phase: "ready" } : null);
          }
        })
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          preflightWalletRef.current = null;
          setPreflight((p) => p ? { ...p, phase: "error", error: msg } : null);
        });
    });
  }

  function onPreflightConfirm() {
    const w = preflightWalletRef.current;
    preflightWalletRef.current = null;
    setPreflight(null);
    preflightResolveRef.current?.(w);
    preflightResolveRef.current = null;
  }

  function onPreflightCancel() {
    preflightWalletRef.current = null;
    setPreflight(null);
    preflightResolveRef.current?.(null);
    preflightResolveRef.current = null;
  }

  // authUser !== null means the user is signed in with Google (backend session).

  function onChange(key: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));
  }

  // Country input change: update form AND fly map when a complete country is selected.
  function onCountryChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setForm((f) => ({ ...f, country: v }));
    if (COUNTRY_NAMES.includes(v)) {
      setMapFlyQuery(v);
    }
  }

  function onTextAreaChange(key: keyof FormState) {
    return (e: React.ChangeEvent<HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));
  }

  function onLocation(r: LocationResult) {
    setForm((f) => ({
      ...f,
      lat:     r.lat,
      lng:     r.lng,
      address: r.address,
      city:    r.city    || f.city,
      country: r.country || f.country,
    }));
  }

  function goTo(next: number) {
    setDir(next > step ? 1 : -1);
    setStep(next);
  }

  function bumpProgress(id: string, s: ProgressStatus, detail?: string) {
    setProgress((prev) =>
      prev.map((p) => (p.id === id ? { ...p, status: s, ...(detail ? { detail } : {}) } : p))
    );
  }

  async function handleDeploy() {
    // ── Step 1: detect + pick wallet ──────────────────────────────────────────
    let liveWallet: ConnectedWallet | null = wallet;
    if (!liveWallet) {
      type MW = { name?: string; icon?: string };
      const midnightObj = (window as unknown as { midnight?: Record<string, MW> }).midnight;
      if (!midnightObj || Object.keys(midnightObj).length === 0) {
        setError(
          "No Midnight wallet detected. Install a Midnight-compatible wallet (e.g. Lace) and enable the Midnight network.",
        );
        return;
      }
      const keys = Object.keys(midnightObj);
      let walletKey: string;
      if (keys.length > 1) {
        const choices: AvailableWallet[] = keys.map((k) => ({
          key: k,
          name: midnightObj[k]!.name || k.replace(/^mn/i, "").replace(/([a-z])([A-Z])/g, "$1 $2"),
          icon: midnightObj[k]!.icon,
        }));
        const chosen = await requestWalletPick(choices);
        if (!chosen) return;
        walletKey = chosen;
      } else {
        walletKey = keys[0]!;
      }
      const meta = midnightObj[walletKey]!;
      // ── Step 2: pre-flight (connects wallet + fetches DUST balance) ───────
      liveWallet = await launchPreflight(
        walletKey,
        meta.name || walletKey.replace(/^mn/i, "").replace(/([a-z])([A-Z])/g, "$1 $2"),
        meta.icon,
      );
      if (!liveWallet) return; // user cancelled
    }

    setLoading(true);
    setError(null);
    setProgress(INITIAL_PROGRESS.map((s) => ({ ...s })));

    try {
      // liveWallet already connected via preflight (or re-used from context).
      const [{ createEventTicketProviders }, { EventTicketAPI }, { PREPROD_CONFIG }] =
        await Promise.all([
          import("@sdk/providers"),
          import("@sdk/contract-api"),
          import("@sdk/types"),
        ]);

      const providers = await createEventTicketProviders(liveWallet!, PREPROD_CONFIG);
      const api       = await EventTicketAPI.deploy(providers);
      bumpProgress("deploy", "done", api.contractAddress);
      bumpProgress("circuit", "active");

      await api.createEvent(form.eventName.trim(), BigInt(form.totalTickets));
      bumpProgress("circuit", "done");
      bumpProgress("key", "active");

      const toIso = (d: string, t: string) =>
        d && t ? new Date(`${d}T${t}:00`).toISOString() : new Date().toISOString();

      const startDateIso = toIso(form.startDate, form.startTime);
      const endDateIso   = toIso(form.endDate,   form.endTime);
      const locationStr  = form.address.trim() ||
        [form.city, form.country].filter(Boolean).join(", ") ||
        "TBD";

      // callerSecret is the only copy — save before anything else.
      saveCallerSecret(api.contractAddress, api.callerSecretHex());
      saveEvent({
        contractAddress: api.contractAddress,
        eventName:       form.eventName.trim(),
        totalTickets:    parseInt(form.totalTickets, 10),
        txId:            "",
        createdAt:       new Date().toISOString(),
        callerSecretHex: api.callerSecretHex(),
        description:     form.description.trim(),
        location:        locationStr,
        country:         form.country   || undefined,
        city:            form.city      || undefined,
        latitude:        form.lat       ?? undefined,
        longitude:       form.lng       ?? undefined,
        startDate:       startDateIso,
        endDate:         endDateIso,
      });

      bumpProgress("key", "done");
      bumpProgress("backend", "active");

      let backendSyncFailed = false;
      try {
        await backendApi.events.create({
          contractAddress: api.contractAddress,
          name:            form.eventName.trim(),
          description:     form.description.trim() || "—",
          location:        locationStr,
          country:         form.country  || undefined,
          city:            form.city     || undefined,
          latitude:        form.lat      ?? undefined,
          longitude:       form.lng      ?? undefined,
          startDate:       startDateIso,
          endDate:         endDateIso,
          maxCapacity:     parseInt(form.totalTickets, 10),
        });
        await queryClient.invalidateQueries({ queryKey: ["events"] });
        bumpProgress("backend", "done");
      } catch (syncErr) {
        backendSyncFailed = true;
        const syncMsg = syncErr instanceof Error ? syncErr.message : String(syncErr);
        console.warn("Backend sync failed:", syncMsg);
        bumpProgress("backend", "error", syncMsg.slice(0, 60));
      }

      setSuccess({ contractAddress: api.contractAddress, eventName: form.eventName.trim(), backendSyncFailed });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setProgress((prev) =>
        prev.map((s) => (s.status === "active" ? { ...s, status: "error" } : s))
      );
    } finally {
      setLoading(false);
    }
  }

  async function retryBackendSync() {
    if (!success) return;
    const toIso = (d: string, t: string) =>
      d && t ? new Date(`${d}T${t}:00`).toISOString() : new Date().toISOString();
    const locationStr = form.address.trim() ||
      [form.city, form.country].filter(Boolean).join(", ") || "TBD";
    try {
      await backendApi.events.create({
        contractAddress: success.contractAddress,
        name:            form.eventName.trim(),
        description:     form.description.trim() || "—",
        location:        locationStr,
        country:         form.country  || undefined,
        city:            form.city     || undefined,
        latitude:        form.lat      ?? undefined,
        longitude:       form.lng      ?? undefined,
        startDate:       toIso(form.startDate, form.startTime),
        endDate:         toIso(form.endDate,   form.endTime),
        maxCapacity:     parseInt(form.totalTickets, 10),
      });
      await queryClient.invalidateQueries({ queryKey: ["events"] });
      setSuccess((s) => s ? { ...s, backendSyncFailed: false } : s);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("Retry backend sync failed:", msg);
    }
  }

  return (
    <>
      <Nav />

      {/* ── Cinematic deploy overlay ──────────────────────────────── */}
      <AnimatePresence>
        {loading && progress.length > 0 && (
          <DeployOverlay steps={progress} eventName={form.eventName} />
        )}
      </AnimatePresence>

      <main className="min-h-dvh bg-[#080808] pt-14">
        <div className="grid-lines absolute inset-0 pointer-events-none opacity-40" />

        <div className="relative mx-auto max-w-5xl px-5 pt-10 pb-28">

          <div className="flex items-center gap-2 text-xs text-zinc-700 mb-10">
            <Link href="/events" className="hover:text-zinc-400 transition-colors">Events</Link>
            <span>/</span>
            <span className="text-zinc-500">New</span>
          </div>

          <div className="mb-8">
            <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest mb-2">Organizer</p>
            <h1 className="text-2xl font-bold text-white tracking-tight mb-2">Create Event</h1>
            <p className="text-sm text-zinc-600 max-w-md">
              Deploy a zero-knowledge ticketing contract on Midnight.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-10 items-start">

            {/* ── Wallet picker overlay ──────────────────────────────── */}
            {walletChoices && (
              <WalletPickerModal
                wallets={walletChoices}
                onPick={(key) => onWalletChosen(key)}
                onCancel={() => onWalletChosen(null)}
              />
            )}

            {/* ── Wallet pre-flight overlay ──────────────────────────── */}
            {preflight && (
              <WalletPreflightModal
                state={preflight}
                onConfirm={onPreflightConfirm}
                onCancel={onPreflightCancel}
              />
            )}

          {/* ── Left: wizard / success ─────────────────────────────── */}
            <AnimatePresence mode="wait">
              {success ? (
                <SuccessScreen
                  key="success" result={success} form={form}
                  onManage={() => router.push(`/events/${encodeURIComponent(success.contractAddress)}`)}
                  onRetryBackend={success.backendSyncFailed ? retryBackendSync : undefined}
                />
              ) : (
                <motion.div key="wizard"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <Stepper current={step} />
                  <AnimatePresence custom={dir} mode="wait">
                    {step === 0 && (
                      <motion.div key="s0" custom={dir} variants={stepVariants}
                        initial="enter" animate="center" exit="exit">
                        <Step0 form={form} onChange={onChange} onNext={() => goTo(1)} />
                      </motion.div>
                    )}
                    {step === 1 && (
                      <motion.div key="s1" custom={dir} variants={stepVariants}
                        initial="enter" animate="center" exit="exit">
                        <Step1 form={form} onChange={onChange}
                          onTextAreaChange={onTextAreaChange}
                          onLocation={onLocation}
                          onCountryChange={onCountryChange}
                          mapFlyQuery={mapFlyQuery}
                          onBack={() => goTo(0)} onNext={() => goTo(2)} />
                      </motion.div>
                    )}
                    {step === 2 && (
                      <motion.div key="s2" custom={dir} variants={stepVariants}
                        initial="enter" animate="center" exit="exit">
                        <ReviewStep form={form} progress={progress}
                          loading={loading} error={error}
                          onBack={() => goTo(1)} onDeploy={handleDeploy}
                          onDismissError={() => { setError(null); setProgress([]); }} />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── Right: live preview + context ─────────────────────── */}
            <div className="space-y-4 lg:sticky lg:top-20">
              <EventPlaceholder name={form.eventName} />

              {step < 2 && (
                <div className="border border-white/6 bg-white/[0.015] p-4 space-y-3">
                  <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest">
                    {step === 0 ? "On-chain data" : "Off-chain data"}
                  </p>
                  {step === 0 ? (
                    <ul className="space-y-2">
                      {[
                        { f: "event_name",    t: "Bytes<32>", n: "UTF-8 padded"  },
                        { f: "total_tickets", t: "Uint<32>",  n: "immutable cap" },
                        { f: "organizer",     t: "Bytes<32>", n: "hash only"     },
                        { f: "is_active",     t: "Boolean",   n: ""              },
                        { f: "is_cancelled",  t: "Boolean",   n: "permanent"     },
                      ].map(({ f, t, n }) => (
                        <li key={f} className="flex items-baseline gap-1.5 flex-wrap">
                          <code className="text-[11px] font-mono text-zinc-400">{f}</code>
                          <span className="text-[10px] font-mono text-zinc-700">:{t}</span>
                          {n && <span className="text-[9px] text-zinc-800 italic">{n}</span>}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <ul className="space-y-1.5">
                      {["description","location","country","city","startDate","endDate","maxCapacity"].map((f) => (
                        <li key={f} className="flex items-center gap-1.5">
                          <code className="text-[11px] font-mono text-zinc-500">{f}</code>
                          <span className="text-[9px] text-zinc-800 italic">backend</span>
                        </li>
                      ))}
                      <li className="flex items-center gap-1.5 pt-1">
                        <code className="text-[11px] font-mono text-amber-500/80">callerSecretHex</code>
                        <span className="text-[9px] font-semibold text-amber-700 uppercase tracking-wide">critical</span>
                      </li>
                    </ul>
                  )}
                </div>
              )}

              {step === 2 && <KeyWarningPanel />}
            </div>

          </div>
        </div>
      </main>
    </>
  );
}
