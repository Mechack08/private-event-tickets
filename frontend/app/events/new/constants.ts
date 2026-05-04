import type { ProgressStep } from "./types";

/** 1 DUST = 1,000,000 raw units (6 decimal places — Cardano/Midnight convention). */
export const DUST_SCALE = 1_000_000n;

/** Estimated raw-unit cost of contract deploy + createEvent ZK transaction (~0.5 DUST). */
export const DEPLOY_COST_ESTIMATE = 500_000n;

export const WIZARD_STEPS = [
  { label: "Core",    sub: "on-chain"  },
  { label: "Details", sub: "off-chain" },
  { label: "Review",  sub: "deploy"    },
] as const;

export const INITIAL_PROGRESS: ProgressStep[] = [
  { id: "deploy",  label: "Deploying contract",          status: "active" },
  { id: "circuit", label: "Initialising on-chain state", status: "idle"   },
  { id: "key",     label: "Saving organizer key",        status: "idle"   },
  { id: "backend", label: "Registering metadata",        status: "idle"   },
];

export const STEP_META: Record<string, { icon: string; tagline: string; color: string }> = {
  deploy:  { icon: "◈", tagline: "Weaving the contract into the ledger…",   color: "#a78bfa" },
  circuit: { icon: "⬡", tagline: "Constructing the ZK state machine…",      color: "#38bdf8" },
  key:     { icon: "⊕", tagline: "Sealing the organizer commitment…",        color: "#34d399" },
  backend: { icon: "◎", tagline: "Synchronising with the event index…",      color: "#fb923c" },
};

/** Convert raw DUST units to a human-readable string (e.g. 1_500_000_000_000n → "1.5B"). */
export function formatDust(rawN: bigint): string {
  const d = Number(rawN) / Number(DUST_SCALE);
  if (d >= 1e9) return (d / 1e9).toLocaleString(undefined, { maximumFractionDigits: 2 }) + "B";
  if (d >= 1e6) return (d / 1e6).toLocaleString(undefined, { maximumFractionDigits: 2 }) + "M";
  if (d >= 1e3) return (d / 1e3).toLocaleString(undefined, { maximumFractionDigits: 1 }) + "K";
  return d.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export const inputCls =
  "w-full bg-white/[0.03] border border-white/8 px-4 py-3 text-sm text-white " +
  "placeholder-zinc-700 focus:outline-none focus:border-white/25 " +
  "disabled:opacity-40 transition-colors rounded-none";
