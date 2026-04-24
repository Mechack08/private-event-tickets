"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { Nav } from "@/components/Nav";
import { WalletConnect } from "@/components/WalletConnect";
import { useWallet } from "@/contexts/WalletContext";
import { saveEvent, saveCallerSecret } from "@/lib/storage";
import { api as backendApi } from "@/lib/api";


// ─── Types ────────────────────────────────────────────────────────────────────

interface FormState {
  eventName: string;
  totalTickets: string;
  description: string;
  location: string;
  eventDate: string;
  eventTime: string;
}

type StepStatus = "idle" | "active" | "done" | "error";

interface Step {
  id: string;
  label: string;
  detail?: string;
  status: StepStatus;
}

interface DeploySuccess {
  contractAddress: string;
  callerSecretHex: string;
  eventName: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const INITIAL_STEPS: Step[] = [
  { id: "deploy",  label: "Deploying contract",          status: "active" },
  { id: "circuit", label: "Initialising on-chain state", status: "idle"   },
  { id: "key",     label: "Saving organizer key",        status: "idle"   },
  { id: "backend", label: "Registering event metadata",  status: "idle"   },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function Spinner({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="animate-spin shrink-0">
      <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function StepRow({ step }: { step: Step }) {
  return (
    <motion.div layout className="flex items-start gap-3">
      <div className="mt-0.5 w-5 h-5 flex items-center justify-center shrink-0">
        {step.status === "done"   && <CheckIcon className="w-4 h-4 text-emerald-400" />}
        {step.status === "active" && <Spinner size={14} />}
        {step.status === "error"  && (
          <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        )}
        {step.status === "idle" && <div className="w-1.5 h-1.5 rounded-full bg-zinc-700" />}
      </div>

      <div className="flex-1 min-w-0 pb-0.5">
        <p className={`text-sm leading-none ${
          step.status === "active" ? "text-white"
          : step.status === "done"   ? "text-zinc-400"
          : step.status === "error"  ? "text-red-400"
          : "text-zinc-600"
        }`}>
          {step.label}
        </p>
        {step.detail && step.status === "done" && (
          <p className="text-[11px] font-mono text-zinc-600 mt-1 truncate">{step.detail}</p>
        )}
      </div>
    </motion.div>
  );
}

function Field({
  id, label, badge, hint, children,
}: {
  id: string;
  label: string;
  badge?: string;
  hint?: string;
  children: React.ReactNode;
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
      </div>
      {children}
      {hint && <p className="text-[10px] text-zinc-700 mt-1.5 leading-relaxed">{hint}</p>}
    </div>
  );
}

function SectionDivider({ label, sub }: { label: string; sub: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-0.5 h-4 bg-white/15 rounded-full" />
      <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-widest">{label}</p>
      <div className="flex-1 h-px bg-white/6" />
      <span className="text-[10px] font-mono text-zinc-700">{sub}</span>
    </div>
  );
}

const inputCls =
  "w-full bg-white/[0.03] border border-white/8 px-4 py-3 text-sm text-white placeholder-zinc-700 focus:outline-none focus:border-white/25 disabled:opacity-40 transition-colors rounded-none";

// ─── Data model info panel ────────────────────────────────────────────────────

function DataModelPanel() {
  return (
    <div className="border border-white/8 bg-white/[0.018] p-5 space-y-5">
      <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">
        Data model
      </p>

      <div className="space-y-2.5">
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-mono font-semibold text-white/50 border border-white/10 px-1.5 py-0.5 leading-tight">
            ON-CHAIN
          </span>
          <span className="text-[10px] text-zinc-700">Midnight ledger</span>
        </div>
        <ul className="space-y-1.5 pl-1">
          {[
            { field: "event_name",     type: "Bytes<32>", note: "UTF-8, padded"   },
            { field: "total_tickets",  type: "Uint<32>",  note: "immutable cap"   },
            { field: "organizer",      type: "Bytes<32>", note: "hash commitment" },
            { field: "tickets_issued", type: "Counter",   note: "monotonic"       },
            { field: "is_active",      type: "Boolean",   note: ""                },
            { field: "is_cancelled",   type: "Boolean",   note: "permanent"       },
          ].map(({ field, type, note }) => (
            <li key={field} className="flex items-baseline gap-1.5 flex-wrap">
              <code className="text-[11px] font-mono text-zinc-400 shrink-0">{field}</code>
              <span className="text-[10px] font-mono text-zinc-700">:{type}</span>
              {note && <span className="text-[9px] text-zinc-700 italic">{note}</span>}
            </li>
          ))}
        </ul>
      </div>

      <div className="h-px bg-white/6" />

      <div className="space-y-2.5">
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-mono font-semibold text-amber-500/70 border border-amber-500/20 px-1.5 py-0.5 leading-tight">
            BROWSER
          </span>
          <span className="text-[10px] text-zinc-700">localStorage</span>
        </div>
        <ul className="space-y-1.5 pl-1">
          {[
            { field: "callerSecretHex", critical: true  },
            { field: "contractAddress", critical: false },
            { field: "eventName",       critical: false },
            { field: "description",     critical: false },
            { field: "location",        critical: false },
            { field: "eventDate",       critical: false },
          ].map(({ field, critical }) => (
            <li key={field} className="flex items-center gap-1.5">
              <span className={`w-1 h-1 rounded-full shrink-0 ${critical ? "bg-amber-400" : "bg-zinc-700"}`} />
              <code className={`text-[11px] font-mono ${critical ? "text-amber-400/90" : "text-zinc-500"}`}>
                {field}
              </code>
              {critical && (
                <span className="text-[9px] font-semibold text-amber-700 uppercase tracking-wide">
                  critical
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div className="h-px bg-white/6" />

      <div className="space-y-2.5">
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-mono font-semibold text-blue-400/60 border border-blue-500/20 px-1.5 py-0.5 leading-tight">
            BACKEND
          </span>
          <span className="text-[10px] text-zinc-700">PostgreSQL</span>
        </div>
        <ul className="space-y-1.5 pl-1">
          {["name", "description", "location", "date", "maxCapacity"].map((f) => (
            <li key={f}>
              <code className="text-[11px] font-mono text-zinc-500">{f}</code>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function KeyWarningPanel() {
  return (
    <div className="border border-amber-500/25 bg-amber-500/[0.04] p-5">
      <div className="flex items-start gap-3">
        <svg
          className="w-4 h-4 text-amber-400 mt-0.5 shrink-0"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z"
          />
        </svg>
        <div className="space-y-2">
          <p className="text-sm font-semibold text-amber-400">Organizer key</p>
          <p className="text-xs text-zinc-500 leading-relaxed">
            After deploy, <code className="text-zinc-400 font-mono text-[11px]">callerSecretHex</code> is
            automatically saved in this browser. It is the ZK preimage to the on-chain organizer
            hash commitment.
          </p>
          <p className="text-xs text-zinc-600 leading-relaxed">
            <span className="text-zinc-500 font-medium">Losing it means losing the ability to call
            any organizer-gated circuit</span> — no one can issue, pause, cancel, or grant delegates.
            The event becomes permanently unmanageable.
          </p>
          <p className="text-[11px] text-zinc-700 leading-relaxed">
            The raw key is never sent to any server.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Success screen ───────────────────────────────────────────────────────────

function SuccessScreen({
  result,
  onManage,
}: {
  result: DeploySuccess;
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
    <motion.div
      key="success"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="space-y-4"
    >
      <div className="border border-white/8 bg-white/[0.025] p-7">
        {/* Header */}
        <div className="flex items-center gap-3 mb-7">
          <div className="w-9 h-9 bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center shrink-0">
            <CheckIcon className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <p className="text-base font-semibold text-white">Event deployed</p>
            <p className="text-xs text-zinc-500 mt-0.5">Contract initialised on Midnight preprod.</p>
          </div>
        </div>

        {/* Event name */}
        <div className="mb-4 px-4 py-3 bg-white/[0.03] border border-white/6">
          <p className="text-[10px] font-medium text-zinc-600 uppercase tracking-widest mb-1.5">Event</p>
          <p className="text-sm font-semibold text-white">{result.eventName}</p>
        </div>

        {/* Contract address */}
        <div className="mb-4 px-4 py-3 bg-white/[0.03] border border-white/6">
          <p className="text-[10px] font-medium text-zinc-600 uppercase tracking-widest mb-2">Contract address</p>
          <div className="flex items-start gap-2">
            <code className="text-[11px] font-mono text-zinc-300 flex-1 break-all leading-relaxed">
              {result.contractAddress}
            </code>
            <button
              onClick={copy}
              className="shrink-0 text-[11px] text-zinc-500 hover:text-white border border-white/8 hover:border-white/20 px-2.5 py-1.5 transition-colors mt-0.5"
            >
              {copied ? "✓ Copied" : "Copy"}
            </button>
          </div>
        </div>

        {/* Key saved */}
        <div className="mb-7 px-4 py-3.5 bg-emerald-500/[0.04] border border-emerald-500/20">
          <div className="flex items-start gap-2.5">
            <svg
              className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5"
              fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
            <div>
              <p className="text-sm font-semibold text-emerald-400">Organizer key saved</p>
              <p className="text-xs text-zinc-500 mt-0.5">
                Stored in <code className="font-mono text-[11px]">localStorage</code> — keep
                this browser to manage the event.
              </p>
            </div>
          </div>
        </div>

        {/* CTAs */}
        <div className="flex gap-3">
          <button
            onClick={onManage}
            className="flex-1 bg-white text-black text-sm font-semibold py-3 hover:bg-zinc-100 transition-colors"
          >
            Manage Event →
          </button>
          <Link
            href="/events"
            className="flex items-center border border-white/8 text-zinc-400 text-sm px-5 py-3 hover:text-white hover:border-white/20 transition-colors"
          >
            All Events
          </Link>
        </div>
      </div>

      {/* Reminder */}
      <div className="border border-amber-500/20 bg-amber-500/[0.03] px-4 py-3 flex items-start gap-2.5">
        <svg
          className="w-3.5 h-3.5 text-amber-500/70 mt-0.5 shrink-0"
          fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
        </svg>
        <p className="text-xs text-zinc-600 leading-relaxed">
          Do not clear <code className="font-mono text-[11px] text-zinc-500">localStorage</code> without
          exporting your organizer key first. The event management page lets you copy it at any time.
        </p>
      </div>
    </motion.div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NewEventPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { status, wallet } = useWallet();

  const [form, setForm] = useState<FormState>({
    eventName:    "",
    totalTickets: "100",
    description:  "",
    location:     "",
    eventDate:    "",
    eventTime:    "18:00",
  });

  const [steps,   setSteps]   = useState<Step[]>([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [success, setSuccess] = useState<DeploySuccess | null>(null);

  const isReady = status === "connected" && wallet !== null;

  function field<K extends keyof FormState>(key: K) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));
  }

  function bumpStep(id: string, s: StepStatus, detail?: string) {
    setSteps((prev) =>
      prev.map((step) =>
        step.id === id ? { ...step, status: s, ...(detail ? { detail } : {}) } : step
      )
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isReady) return;

    setLoading(true);
    setError(null);
    setSteps(INITIAL_STEPS.map((s) => ({ ...s })));

    try {
      const [{ createEventTicketProviders }, { EventTicketAPI }, { PREPROD_CONFIG }] =
        await Promise.all([
          import("@sdk/providers"),
          import("@sdk/contract-api"),
          import("@sdk/types"),
        ]);

      // ── 1. Deploy contract ────────────────────────────────────────────────
      const providers = await createEventTicketProviders(wallet, PREPROD_CONFIG);
      const api = await EventTicketAPI.deploy(providers);
      bumpStep("deploy", "done", api.contractAddress);
      bumpStep("circuit", "active");

      // ── 2. Initialise on-chain state ──────────────────────────────────────
      await api.createEvent(form.eventName.trim(), BigInt(form.totalTickets));
      bumpStep("circuit", "done");
      bumpStep("key", "active");

      // ── 3. Persist organizer key + metadata ───────────────────────────────
      const eventDateIso =
        form.eventDate && form.eventTime
          ? new Date(`${form.eventDate}T${form.eventTime}:00`).toISOString()
          : new Date().toISOString();

      // Store the secret under a separate key — never mixed in with the
      // public event list. This is the only copy that exists.
      saveCallerSecret(api.contractAddress, api.callerSecretHex());

      saveEvent({
        contractAddress: api.contractAddress,
        eventName:       form.eventName.trim(),
        totalTickets:    parseInt(form.totalTickets, 10),
        txId:            "",   // individual circuit txId not critical here
        createdAt:       new Date().toISOString(),
        callerSecretHex: api.callerSecretHex(),
        description:     form.description.trim(),
        location:        form.location.trim(),
        eventDate:       eventDateIso,
      });

      bumpStep("key", "done");
      bumpStep("backend", "active");

      // ── 4. Register in backend (non-fatal) ────────────────────────────────
      try {
        await backendApi.events.create({
          contractAddress: api.contractAddress,
          name:            form.eventName.trim(),
          description:     form.description.trim(),
          location:        form.location.trim(),
          date:            eventDateIso,
          maxCapacity:     parseInt(form.totalTickets, 10),
        });
        await queryClient.invalidateQueries({ queryKey: ["events"] });
      } catch {
        console.warn("Backend sync failed — event is still live on-chain.");
      }

      bumpStep("backend", "done");

      setSuccess({
        contractAddress: api.contractAddress,
        callerSecretHex: api.callerSecretHex(),
        eventName:       form.eventName.trim(),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setSteps((prev) =>
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

          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-xs text-zinc-700 mb-10">
            <Link href="/events" className="hover:text-zinc-400 transition-colors">Events</Link>
            <span>/</span>
            <span className="text-zinc-500">New</span>
          </div>

          {/* Two-column layout */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-8 items-start">

            {/* ── Left: form or success ───────────────────────────────── */}
            <AnimatePresence mode="wait">
              {success ? (
                <SuccessScreen
                  key="success"
                  result={success}
                  onManage={() =>
                    router.push(`/events/${encodeURIComponent(success.contractAddress)}`)
                  }
                />
              ) : (
                <motion.div
                  key="form"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                >
                  {/* Heading */}
                  <div className="mb-8">
                    <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest mb-2">
                      Organizer
                    </p>
                    <h1 className="text-2xl font-bold text-white tracking-tight mb-2.5">
                      Create Event
                    </h1>
                    <p className="text-sm text-zinc-500 leading-relaxed max-w-lg">
                      Deploy a zero-knowledge ticketing contract on Midnight.
                      Your identity is committed on-chain as a hash — the raw
                      organizer key only lives in your browser.
                    </p>
                  </div>

                  <form onSubmit={handleSubmit} className="space-y-9">

                    {/* ── On-chain fields ─────────────────────────────── */}
                    <div className="space-y-5">
                      <SectionDivider label="On-chain" sub="committed to Midnight ledger" />

                      <Field
                        id="eventName"
                        label="Event name"
                        badge="Bytes<32>"
                        hint="Stored on-chain padded to 32 bytes UTF-8. Will be truncated beyond 32 characters."
                      >
                        <input
                          id="eventName"
                          type="text"
                          placeholder="e.g. DevCon 2026"
                          value={form.eventName}
                          onChange={field("eventName")}
                          maxLength={32}
                          required
                          disabled={loading}
                          className={inputCls}
                        />
                      </Field>

                      <Field
                        id="totalTickets"
                        label="Max capacity"
                        badge="Uint<32>"
                        hint="Maximum tickets the contract will ever issue. Immutable after deploy."
                      >
                        <input
                          id="totalTickets"
                          type="number"
                          min={1}
                          max={4294967295}
                          value={form.totalTickets}
                          onChange={field("totalTickets")}
                          required
                          disabled={loading}
                          className={inputCls}
                        />
                      </Field>
                    </div>

                    {/* ── Off-chain fields ─────────────────────────────── */}
                    <div className="space-y-5">
                      <SectionDivider label="Off-chain" sub="backend + browser only" />

                      <Field id="description" label="Description">
                        <textarea
                          id="description"
                          placeholder="Tell attendees what this event is about…"
                          value={form.description}
                          onChange={field("description")}
                          rows={3}
                          maxLength={5000}
                          required
                          disabled={loading}
                          className={`${inputCls} resize-none`}
                        />
                      </Field>

                      <Field id="location" label="Location">
                        <input
                          id="location"
                          type="text"
                          placeholder="City, venue, or Online"
                          value={form.location}
                          onChange={field("location")}
                          maxLength={300}
                          required
                          disabled={loading}
                          className={inputCls}
                        />
                      </Field>

                      <div className="grid grid-cols-2 gap-4">
                        <Field id="eventDate" label="Date">
                          <input
                            id="eventDate"
                            type="date"
                            value={form.eventDate}
                            onChange={field("eventDate")}
                            required
                            disabled={loading}
                            className={inputCls}
                          />
                        </Field>
                        <Field id="eventTime" label="Time (local)">
                          <input
                            id="eventTime"
                            type="time"
                            value={form.eventTime}
                            onChange={field("eventTime")}
                            required
                            disabled={loading}
                            className={inputCls}
                          />
                        </Field>
                      </div>
                    </div>

                    {/* ── Wallet gate ──────────────────────────────────── */}
                    {!isReady && (
                      <div className="space-y-4">
                        <SectionDivider label="Wallet" sub="required to sign transactions" />
                        <WalletConnect />
                      </div>
                    )}

                    {/* ── Deploy progress ──────────────────────────────── */}
                    <AnimatePresence>
                      {steps.length > 0 && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="border border-white/8 bg-white/[0.02] p-5 space-y-3.5">
                            <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest mb-4">
                              Deployment progress
                            </p>
                            {steps.map((step) => <StepRow key={step.id} step={step} />)}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* ── Error ────────────────────────────────────────── */}
                    <AnimatePresence>
                      {error && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="border border-red-500/30 bg-red-500/[0.05] px-4 py-4">
                            <p className="text-sm font-semibold text-red-400 mb-1">
                              Deployment failed
                            </p>
                            <p className="text-xs text-zinc-500 leading-relaxed">{error}</p>
                            <button
                              type="button"
                              onClick={() => { setError(null); setSteps([]); setLoading(false); }}
                              className="text-xs text-zinc-500 hover:text-white mt-3 underline underline-offset-2 transition-colors"
                            >
                              Dismiss and retry
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* ── Submit / loading button ───────────────────────── */}
                    {loading ? (
                      <div className="w-full flex items-center justify-center gap-2.5 bg-white/[0.05] border border-white/8 text-zinc-500 text-sm py-3.5 cursor-not-allowed select-none">
                        <Spinner size={13} />
                        <span>Deploying — do not close the tab</span>
                      </div>
                    ) : !error ? (
                      <button
                        type="submit"
                        disabled={!isReady}
                        className="w-full bg-white text-black text-sm font-semibold py-3.5 hover:bg-zinc-100 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
                      >
                        Deploy &amp; Create Event
                      </button>
                    ) : null}

                  </form>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── Right: info panels (sticky) ──────────────────────────── */}
            <div className="space-y-4 lg:sticky lg:top-20">
              <DataModelPanel />
              <KeyWarningPanel />
            </div>

          </div>
        </div>
      </main>
    </>
  );
}

