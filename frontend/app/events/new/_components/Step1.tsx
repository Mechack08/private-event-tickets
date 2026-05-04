"use client";

import dynamic from "next/dynamic";
import { COUNTRY_NAMES } from "@/lib/countries";
import type { LocationResult } from "@/components/LocationPickerMap";
import type { FormState } from "../types";
import { inputCls } from "../constants";
import { Field } from "./Field";

// Leaflet requires the DOM — load client-side only.
const LocationPickerMap = dynamic(
  () => import("@/components/LocationPickerMap"),
  { ssr: false },
);

export function Step1({
  form, onChange, onTextAreaChange, onLocation, onCountryChange, mapFlyQuery, onBack, onNext,
}: {
  form: FormState;
  onChange: (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) => void;
  onTextAreaChange: (key: keyof FormState) => (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onLocation: (r: LocationResult) => void;
  onCountryChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  mapFlyQuery: string;
  onBack: () => void;
  onNext: () => void;
}) {
  const canContinue =
    form.description.trim().length > 0 &&
    !!form.startDate && !!form.startTime &&
    !!form.endDate && !!form.endTime &&
    (form.city.trim().length > 0 || form.address.trim().length > 0);

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

      {/* Schedule */}
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

      {/* Location */}
      <div className="space-y-3">
        <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest">Location</p>
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
