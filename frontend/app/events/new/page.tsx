"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { motion, AnimatePresence } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { Nav } from "@/components/Nav";
import { WalletConnect } from "@/components/WalletConnect";
import { EventPlaceholder } from "@/components/EventPlaceholder";
import type { LocationResult } from "@/components/LocationPickerMap";
import { useWallet } from "@/contexts/WalletContext";
import { saveEvent, saveCallerSecret } from "@/lib/storage";
import { api as backendApi } from "@/lib/api";

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
  contractAddress: string;
  eventName:       string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

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

// ─── Deploy progress row ──────────────────────────────────────────────────────

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
  form, onChange, onTextAreaChange, onLocation, onBack, onNext,
}: {
  form: FormState;
  onChange: (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) => void;
  onTextAreaChange: (key: keyof FormState) => (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onLocation: (r: LocationResult) => void;
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
              onChange={onChange("endDate")} required className={inputCls} />
          </Field>
          <Field id="endTime" label="End time (local)">
            <input id="endTime" type="time" value={form.endTime}
              onChange={onChange("endTime")} required className={inputCls} />
          </Field>
        </div>

        {endBeforeStart && (
          <p className="text-[11px] text-amber-400">End must be after start.</p>
        )}
      </div>

      {/* ── Location ─────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest">Location</p>

        {/* Map — click to pin */}
        <LocationPickerMap
          onLocation={onLocation}
          initialLat={form.lat ?? 48.8566}
          initialLng={form.lng ?? 2.3522}
        />

        <div className="grid grid-cols-2 gap-3">
          <Field id="country" label="Country"
            hint="Auto-filled from map, or type manually.">
            <input id="country" type="text" placeholder="e.g. France"
              value={form.country} onChange={onChange("country")}
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
  form, progress, loading, error, isReady,
  onBack, onDeploy, onDismissError,
}: {
  form: FormState;
  progress: ProgressStep[];
  loading: boolean;
  error: string | null;
  isReady: boolean;
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

      {!isReady && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="h-px flex-1 bg-white/6" />
            <span className="text-[10px] font-mono text-zinc-700">wallet required</span>
            <div className="h-px flex-1 bg-white/6" />
          </div>
          <WalletConnect />
        </div>
      )}

      <AnimatePresence>
        {progress.length > 0 && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="border border-white/8 bg-white/[0.02] p-5 space-y-3.5">
              <p className="text-[10px] font-semibold text-zinc-700 uppercase tracking-widest mb-3">
                Deployment progress
              </p>
              {progress.map((s) => <ProgressRow key={s.id} step={s} />)}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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

      {loading ? (
        <div className="w-full flex items-center justify-center gap-2.5 bg-white/[0.05] border border-white/8 text-zinc-500 text-sm py-3.5 cursor-not-allowed select-none">
          <Spinner size={13} />
          <span>Deploying — do not close the tab</span>
        </div>
      ) : !error ? (
        <div className="flex gap-3">
          <button type="button" onClick={onBack} disabled={loading}
            className="border border-white/8 text-zinc-500 text-sm px-5 py-3 hover:text-white hover:border-white/20 transition-colors disabled:opacity-30">
            ← Back
          </button>
          <button type="button" onClick={onDeploy} disabled={!isReady}
            className="flex-1 bg-white text-black text-sm font-semibold py-3 hover:bg-zinc-100 disabled:opacity-25 disabled:cursor-not-allowed transition-colors">
            Deploy &amp; Create Event
          </button>
        </div>
      ) : null}
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
  result, form, onManage,
}: {
  result: DeploySuccess;
  form: FormState;
  onManage: () => void;
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

// ─── Country autocomplete list ────────────────────────────────────────────────

const COUNTRY_NAMES = [
  "Afghanistan","Albania","Algeria","Andorra","Angola","Argentina","Armenia",
  "Australia","Austria","Azerbaijan","Bahamas","Bahrain","Bangladesh","Belarus",
  "Belgium","Belize","Benin","Bolivia","Bosnia and Herzegovina","Botswana",
  "Brazil","Brunei","Bulgaria","Burkina Faso","Cambodia","Cameroon","Canada",
  "Chile","China","Colombia","Costa Rica","Croatia","Cuba","Cyprus",
  "Czech Republic","Denmark","Dominican Republic","Ecuador","Egypt",
  "El Salvador","Estonia","Ethiopia","Finland","France","Georgia","Germany",
  "Ghana","Greece","Guatemala","Haiti","Honduras","Hungary","Iceland","India",
  "Indonesia","Iran","Iraq","Ireland","Israel","Italy","Jamaica","Japan",
  "Jordan","Kazakhstan","Kenya","Kuwait","Kyrgyzstan","Laos","Latvia",
  "Lebanon","Libya","Lithuania","Luxembourg","Malaysia","Maldives","Malta",
  "Mexico","Moldova","Monaco","Mongolia","Montenegro","Morocco","Mozambique",
  "Myanmar","Namibia","Nepal","Netherlands","New Zealand","Nicaragua",
  "Nigeria","North Korea","North Macedonia","Norway","Oman","Pakistan",
  "Panama","Paraguay","Peru","Philippines","Poland","Portugal","Qatar",
  "Romania","Russia","Rwanda","Saudi Arabia","Senegal","Serbia","Singapore",
  "Slovakia","Slovenia","Somalia","South Africa","South Korea","South Sudan",
  "Spain","Sri Lanka","Sudan","Sweden","Switzerland","Syria","Taiwan",
  "Tajikistan","Tanzania","Thailand","Togo","Tunisia","Turkey","Turkmenistan",
  "Uganda","Ukraine","United Arab Emirates","United Kingdom","United States",
  "Uruguay","Uzbekistan","Venezuela","Vietnam","Yemen","Zambia","Zimbabwe",
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NewEventPage() {
  const router      = useRouter();
  const queryClient = useQueryClient();
  const { status, wallet } = useWallet();

  const [form, setForm] = useState<FormState>({
    eventName: "", totalTickets: "100",
    description: "",
    startDate: "", startTime: "18:00",
    endDate:   "", endTime:   "21:00",
    country: "", city: "", address: "",
    lat: null, lng: null,
  });

  const [step,     setStep]     = useState(0);
  const [dir,      setDir]      = useState(1);
  const [progress, setProgress] = useState<ProgressStep[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [success,  setSuccess]  = useState<DeploySuccess | null>(null);

  const isReady = status === "connected" && wallet !== null;

  function onChange(key: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));
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
    if (!isReady) return;
    setLoading(true);
    setError(null);
    setProgress(INITIAL_PROGRESS.map((s) => ({ ...s })));

    try {
      const [{ createEventTicketProviders }, { EventTicketAPI }, { PREPROD_CONFIG }] =
        await Promise.all([
          import("@sdk/providers"),
          import("@sdk/contract-api"),
          import("@sdk/types"),
        ]);

      const providers = await createEventTicketProviders(wallet, PREPROD_CONFIG);
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
        country:         form.country || undefined,
        city:            form.city    || undefined,
        startDate:       startDateIso,
        endDate:         endDateIso,
      });

      bumpProgress("key", "done");
      bumpProgress("backend", "active");

      try {
        await backendApi.events.create({
          contractAddress: api.contractAddress,
          name:            form.eventName.trim(),
          description:     form.description.trim(),
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
      } catch {
        console.warn("Backend sync failed — event is live on-chain.");
      }

      bumpProgress("backend", "done");
      setSuccess({ contractAddress: api.contractAddress, eventName: form.eventName.trim() });
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

  return (
    <>
      <Nav />
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

            {/* ── Left: wizard / success ─────────────────────────────── */}
            <AnimatePresence mode="wait">
              {success ? (
                <SuccessScreen
                  key="success" result={success} form={form}
                  onManage={() => router.push(`/events/${encodeURIComponent(success.contractAddress)}`)}
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
                          onBack={() => goTo(0)} onNext={() => goTo(2)} />
                      </motion.div>
                    )}
                    {step === 2 && (
                      <motion.div key="s2" custom={dir} variants={stepVariants}
                        initial="enter" animate="center" exit="exit">
                        <ReviewStep form={form} progress={progress}
                          loading={loading} error={error} isReady={isReady}
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
