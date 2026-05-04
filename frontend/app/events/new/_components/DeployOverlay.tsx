"use client";

import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useCountUp } from "@/hooks/useCountUp";
import type { ProgressStep } from "../types";
import { STEP_META } from "../constants";
import { Spinner, CheckSm } from "./icons";

// ─── Floating particle ────────────────────────────────────────────────────────

function Particle({ delay, x, size, opacity, duration }: {
  delay: number; x: string; size: number; opacity: number; duration: number;
}) {
  return (
    <motion.div
      className="absolute rounded-full pointer-events-none"
      style={{ left: x, width: size, height: size, background: "white", opacity }}
      initial={{ bottom: "-10%", scale: 0 }}
      animate={{ bottom: "110%", scale: [0, 1, 0.8, 0] }}
      transition={{ duration, delay, repeat: Infinity, ease: "easeOut" }}
    />
  );
}

// ─── Step progress row ────────────────────────────────────────────────────────

export function ProgressRow({ step }: { step: ProgressStep }) {
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

// ─── Deploy overlay ───────────────────────────────────────────────────────────

export function DeployOverlay({ steps, eventName }: { steps: ProgressStep[]; eventName: string }) {
  const activeStep = steps.find((s) => s.status === "active");
  const doneCount  = steps.filter((s) => s.status === "done").length;
  const pct        = Math.round((doneCount / steps.length) * 100);
  const countUp    = useCountUp(pct, 0.7);
  const meta       = activeStep ? (STEP_META[activeStep.id] ?? STEP_META.deploy!) : STEP_META.backend!;

  const particles = useMemo(() =>
    Array.from({ length: 14 }, (_, i) => ({
      id: i,
      delay: i * 0.4,
      x: `${5 + (i * 6.5) % 90}%`,
      size: 2 + (i % 4),
      opacity: 0.04 + (i % 5) * 0.012,
      duration: 6 + (i % 5) * 0.8,
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
      {/* Ambient glow */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        animate={{ opacity: [0.3, 0.6, 0.3] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        style={{ background: `radial-gradient(ellipse 60% 40% at 50% 60%, ${meta.color}18 0%, transparent 70%)` }}
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

      {/* Main content */}
      <div className="relative flex flex-col items-center gap-10 px-6 max-w-sm w-full text-center">

        {/* Animated sigil */}
        <div className="relative">
          <motion.div
            className="absolute inset-0 rounded-full border border-white/5"
            style={{ margin: -24 }}
            animate={{ rotate: 360 }}
            transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          />
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
            const m = STEP_META[s.id] ?? STEP_META.deploy!;
            return (
              <motion.div
                key={s.id}
                className="flex items-center gap-3"
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.08, duration: 0.3 }}
              >
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
                  {s.status === "idle" && <div className="w-1 h-1 rounded-full bg-zinc-800" />}
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
