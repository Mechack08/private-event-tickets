"use client";

import { motion, AnimatePresence } from "framer-motion";
import type { FormState, ProgressStep } from "../types";
import { ProgressRow } from "./DeployOverlay";

export function ReviewStep({
  form, progress, loading, error, onBack, onDeploy, onDismissError,
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
    { label: "Event name",   value: form.eventName || "—",                    tag: "on-chain"  },
    { label: "Capacity",     value: `${form.totalTickets} tickets`,            tag: "on-chain"  },
    { label: "Min age",      value: parseInt(form.minAge) > 0 ? `${form.minAge}+` : "No restriction", tag: "on-chain" },
    { label: "Starts",       value: fmt(form.startDate, form.startTime),       tag: "off-chain" },
    { label: "Ends",         value: fmt(form.endDate,   form.endTime),         tag: "off-chain" },
    { label: "Location",     value: locationDisplay,                           tag: "off-chain" },
    { label: "Description",  value: form.description.length > 90
        ? form.description.slice(0, 90) + "…"
        : form.description,                                                    tag: "off-chain" },
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

      {/* In-progress steps */}
      {loading && progress.length > 0 && (
        <div className="border border-white/8 bg-white/[0.02] p-4 space-y-3">
          {progress.map((s) => <ProgressRow key={s.id} step={s} />)}
        </div>
      )}

      {!loading && !error && (
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
      )}

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
