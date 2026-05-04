"use client";

import { cn } from "@/lib/utils";
import { WIZARD_STEPS } from "../constants";
import { CheckSm } from "./icons";

export function Stepper({ current }: { current: number }) {
  return (
    <div className="flex items-center mb-10">
      {WIZARD_STEPS.map((s, i) => (
        <div key={i} className="contents">
          <div className="flex flex-col items-center gap-1 shrink-0">
            <div className={cn(
              "w-7 h-7 flex items-center justify-center text-[11px] font-bold border transition-all duration-200",
              i === current
                ? "bg-white text-black border-white"
                : i < current
                ? "bg-white/[0.07] text-zinc-400 border-white/20"
                : "bg-transparent text-zinc-700 border-white/8",
            )}>
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
