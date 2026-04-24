"use client";
/**
 * LocationPickerMap — Leaflet/OpenStreetMap map for picking an event location.
 *
 * Must be loaded with `next/dynamic` and `ssr: false` because Leaflet
 * directly accesses the DOM on import.
 *
 * On click the map reverse-geocodes via Nominatim (no API key required)
 * and calls `onLocation` with structured address data.
 */
import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import type L from "leaflet";

export interface LocationResult {
  lat: number;
  lng: number;
  /** Full formatted address from Nominatim. */
  address: string;
  /** City / town / municipality name. */
  city: string;
  /** Country name (English). */
  country: string;
}

interface Props {
  onLocation: (r: LocationResult) => void;
  /** Default centre — Paris. Override with a previously-saved lat/lng. */
  initialLat?: number;
  initialLng?: number;
}

// Small spinner element rendered inside the overlay badge.
function Spin() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
      className="animate-spin shrink-0" style={{ display: "inline-block" }}>
      <circle className="opacity-20" cx="12" cy="12" r="10"
        stroke="currentColor" strokeWidth="3" />
      <path className="opacity-80" fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

export default function LocationPickerMap({
  onLocation,
  initialLat = 48.8566,
  initialLng = 2.3522,
}: Props) {
  const divRef  = useRef<HTMLDivElement>(null);
  const mapRef  = useRef<ReturnType<typeof L.map> | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [hint,  setHint]  = useState<string | null>(null);

  // Keep onLocation ref stable so the click handler always calls the latest.
  const cbRef = useRef(onLocation);
  useEffect(() => { cbRef.current = onLocation; }, [onLocation]);

  useEffect(() => {
    if (!divRef.current || mapRef.current) return;

    // `cancelled` is set synchronously in the cleanup function so that the
    // async import().then() callback becomes a no-op when React StrictMode
    // unmounts the component before the import resolves (which would otherwise
    // cause "Map container is already initialized" on the second mount).
    let cancelled = false;

    import("leaflet").then((mod) => {
      if (cancelled || !divRef.current || mapRef.current) return;

      /* ---- Leaflet default icon fix for webpack ---- */
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Lf = (mod as any).default as typeof L;

      const map = Lf.map(divRef.current, {
        center: [initialLat, initialLng],
        zoom: 12,
        zoomControl: true,
      });
      mapRef.current = map;

      Lf.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      // Custom circular pin (avoids the default marker image-path webpack issue).
      const pin = Lf.divIcon({
        className: "",
        html: `<div style="
          width:18px;height:18px;
          background:white;
          border:2.5px solid #09090b;
          border-radius:50%;
          box-shadow:0 0 0 3px rgba(255,255,255,0.25),0 4px 12px rgba(0,0,0,0.7);
          pointer-events:none;
        "></div>`,
        iconSize:   [18, 18],
        iconAnchor: [9, 9],
      });

      let marker: ReturnType<typeof Lf.marker> | null = null;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      map.on("click", async (e: any) => {
        const { lat, lng } = e.latlng as { lat: number; lng: number };

        // Update or place marker.
        if (marker) {
          marker.setLatLng([lat, lng]);
        } else {
          marker = Lf.marker([lat, lng], { icon: pin }).addTo(map);
        }

        setState("loading");
        setHint(null);

        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse` +
            `?lat=${lat.toFixed(6)}&lon=${lng.toFixed(6)}&format=json&accept-language=en`,
            { headers: { "User-Agent": "midnight-tickets/1.0" } }
          );
          if (!res.ok) throw new Error("geocoding failed");
          const data = (await res.json()) as {
            display_name?: string;
            address?: Record<string, string>;
          };

          const a    = data.address ?? {};
          const city = a["city"] ?? a["town"] ?? a["municipality"] ?? a["village"] ?? a["county"] ?? "";
          const country = a["country"] ?? "";

          cbRef.current({
            lat,
            lng,
            address: data.display_name ?? "",
            city,
            country,
          });

          setHint(city && country ? `${city}, ${country}` : country || city || "Location set");
          setState("idle");
        } catch {
          setState("error");
          setHint("Could not geocode. Try clicking again.");
        }
      });
    });

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // initialise once

  return (
    <>
      {/* Dark-theme overrides for Leaflet chrome */}
      <style>{`
        .leaflet-container { background: #111113 !important; }
        .leaflet-control-attribution {
          background: rgba(0,0,0,0.65) !important;
          color: rgba(255,255,255,0.28) !important;
          font-size: 9px !important;
          line-height: 1.4 !important;
        }
        .leaflet-control-attribution a { color: rgba(255,255,255,0.38) !important; }
        .leaflet-control-zoom a {
          background: #18181b !important;
          color: rgba(255,255,255,0.6) !important;
          border-color: rgba(255,255,255,0.1) !important;
        }
        .leaflet-control-zoom a:hover {
          background: #27272a !important;
          color: white !important;
        }
        .leaflet-bar { border-color: rgba(255,255,255,0.1) !important; }
      `}</style>

      <div className="relative border border-white/8">
        {/* Map container */}
        <div ref={divRef} style={{ height: "260px" }} className="w-full" />

        {/* Tap-to-pick hint (shown before first click) */}
        {state === "idle" && !hint && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 pointer-events-none
            bg-zinc-950/80 border border-white/10 px-3 py-1.5
            text-[10px] text-zinc-400 whitespace-nowrap">
            Click map to pick location
          </div>
        )}

        {/* Geocoding spinner */}
        {state === "loading" && (
          <div className="absolute bottom-2 left-2 right-2
            bg-zinc-950/90 border border-white/8 px-3 py-1.5
            text-[11px] text-zinc-400 flex items-center gap-2">
            <Spin /> Locating…
          </div>
        )}

        {/* Result / error */}
        {state !== "loading" && hint && (
          <div className={`absolute bottom-2 left-2 right-2
            bg-zinc-950/90 border px-3 py-1.5 text-[11px]
            ${state === "error"
              ? "border-red-500/30 text-red-400"
              : "border-white/10 text-zinc-300"}`}>
            {hint}
          </div>
        )}
      </div>
    </>
  );
}
