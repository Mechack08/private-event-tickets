"use client";

import type { FormState } from "../types";
import { inputCls } from "../constants";
import { Field } from "./Field";

export function Step0({
  form, onChange, onNext,
}: {
  form: FormState;
  onChange: (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) => void;
  onNext: () => void;
}) {
  const ageVal = parseInt(form.minAge);
  const canContinue =
    form.eventName.trim().length > 0 &&
    parseInt(form.totalTickets) >= 1 &&
    !isNaN(ageVal) && ageVal >= 0 && ageVal <= 120;

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

      <Field id="minAge" label="Minimum age" badge="Uint<8>"
        hint="Attendees must prove they meet this age via ZK proof. Set 0 for no restriction.">
        <input id="minAge" type="number" min={0} max={120}
          value={form.minAge} onChange={onChange("minAge")}
          required className={inputCls} />
      </Field>

      <button type="button" onClick={onNext} disabled={!canContinue}
        className="w-full bg-white text-black text-sm font-semibold py-3 hover:bg-zinc-100 disabled:opacity-25 disabled:cursor-not-allowed transition-colors mt-2">
        Next: Details →
      </button>
    </div>
  );
}
