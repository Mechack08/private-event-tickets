"use client";

import type { ReactNode } from "react";

export function Field({
  id, label, badge, hint, optional, children,
}: {
  id: string;
  label: string;
  badge?: string;
  hint?: string;
  optional?: boolean;
  children: ReactNode;
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
