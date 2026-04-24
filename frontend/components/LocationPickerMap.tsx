"use client";
/**
 * LocationPickerMap — Leaflet/OpenStreetMap map for picking an event location.
 *
 * Must be loaded with `next/dynamic` and `ssr: false` because Leaflet
 * directly accesses the DOM on import.
 *
 * • Click anywhere on the map to drop a pin and reverse-geocode the position.
 * • "Use my location" button asks for GPS and flies to the device position.
 * • Pass `flyToQuery` (e.g. a country name) to programmatically fly the map.
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
  /** Default map centre. Override with a previously-saved lat/lng. */
  initialLat?: number;
  initialLng?: number;
  /**
   * When this string changes to a non-empty value the map forward-geocodes it
   * via Nominatim and flies to the result. Useful for syncing the country
   * input: set to the full country name whenever the user selects one.
   */
  flyToQuery?: string;
}

// ─── tiny helpers ─────────────────────────────────────────────────────────────

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

// ─── component ────────────────────────────────────────────────────────────────

export default function LocationPickerMap({
  onLocation,
  initialLat = 48.8566,
  initialLng = 2.3522,
  flyToQuery,
}: Props) {
  const divRef    = useRef<HTMLDivElement>(null);
  const mapRef    = useRef<ReturnType<typeof L.map>    | null>(null);
  const markerRef = useRef<ReturnType<typeof L.marker> | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const LfRef     = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pinRef    = useRef<any>(null);

  type MapState = "idle" | "loading" | "locating" | "error";
  const [state, setState] = useState<MapState>("idle");
  const [hint,  setHint]  = useState<string | null>(null);

  // Keep the callback stable across renders.
  const cbRef = useRef(onLocation);
  useEffect(() => { cbRef.current = onLocation; }, [onLocation]);

  // ── Reverse-geocode a lat/lng position ──────────────────────────────────────
  async function reverseGeocode(lat: number, lng: number) {
    setState("loading");
    setHint(null);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse` +
        `?lat=${lat.toFixed(6)}&lon=${lng.toFixed(6)}&format=json&accept-language=en`,
        { headers: { "User-Agent": "midnight-tickets/1.0" } },
      );
      if (!res.ok) throw new Error("geocoding failed");
      const data = (await res.json()) as {
        display_name?: string;
        address?: Record<string, string>;
      };
      const a       = data.address ?? {};
      const city    = a["city"] ?? a["town"] ?? a["municipality"] ?? a["village"] ?? a["county"] ?? "";
      const country = a["country"] ?? "";

      cbRef.current({ lat, lng, address: data.display_name ?? "", city, country });
      setHint(city && country ? `${city}, ${country}` : country || city || "Location set");
      setState("idle");
    } catch {
      setState("error");
      setHint("Could not geocode. Try clicking again.");
    }
  }

  // ── Initialise map (once, cancelled-safe for React StrictMode) ──────────────
  useEffect(() => {
    if (!divRef.current || mapRef.current) return;
    let cancelled = false;

    import("leaflet").then((mod) => {
      if (cancelled || !divRef.current || mapRef.current) return;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Lf = (mod as any).default as typeof L;
      LfRef.current = Lf;

      const map = Lf.map(divRef.current, {
        center: [initialLat, initialLng],
        zoom: 12,
        zoomControl: true,
      });
      mapRef.current = map;

      Lf.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      // Custom circular pin — avoids the default marker webpack image issue.
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
      pinRef.current = pin;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      map.on("click", (e: any) => {
        const { lat, lng } = e.latlng as { lat: number; lng: number };
        if (markerRef.current) {
          markerRef.current.setLatLng([lat, lng]);
        } else {
          markerRef.current = Lf.marker([lat, lng], { icon: pin }).addTo(map);
        }
        reverseGeocode(lat, lng);
      });
    });

    return () => {
      cancelled = true;
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
      markerRef.current = null;
      LfRef.current     = null;
      pinRef.current    = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // initialise once

  // ── Forward-geocode flyToQuery and fly the map to the result ────────────────
  useEffect(() => {
    if (!flyToQuery) return;
    let cancelled = false;

    fetch(
      `https://nominatim.openstreetmap.org/search` +
      `?q=${encodeURIComponent(flyToQuery)}&format=json&limit=1&accept-language=en`,
      { headers: { "User-Agent": "midnight-tickets/1.0" } },
    )
      .then((r) => r.json())
      .then((data: { lat?: string; lon?: string }[]) => {
        if (cancelled || !mapRef.current || !data[0]?.lat || !data[0]?.lon) return;
        mapRef.current.flyTo(
          [parseFloat(data[0].lat), parseFloat(data[0].lon)],
          5, // country-level zoom
          { animate: true, duration: 1 },
        );
      })
      .catch(() => { /* silent — best-effort */ });

    return () => { cancelled = true; };
  }, [flyToQuery]);

  // ── Use device location ──────────────────────────────────────────────────────
  function handleMyLocation() {
    if (!navigator.geolocation) {
      setState("error");
      setHint("Geolocation is not supported by this browser.");
      return;
    }
    setState("locating");
    setHint(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;

        // Fly map and place/update pin.
        mapRef.current?.flyTo([lat, lng], 14, { animate: true, duration: 1 });
        if (LfRef.current && pinRef.current && mapRef.current) {
          if (markerRef.current) {
            markerRef.current.setLatLng([lat, lng]);
          } else {
            markerRef.current = LfRef.current
              .marker([lat, lng], { icon: pinRef.current })
              .addTo(mapRef.current);
          }
        }

        reverseGeocode(lat, lng);
      },
      (err) => {
        setState("error");
        setHint(
          err.code === 1
            ? "Location permission denied."
            : err.code === 2
            ? "Location unavailable."
            : "Location request timed out.",
        );
      },
      { timeout: 8000, enableHighAccuracy: true },
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────
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
        <div ref={divRef} style={{ height: "280px" }} className="w-full" />

        {/* "Use my location" button — top-right, below zoom controls */}
        <button
          type="button"
          onClick={handleMyLocation}
          disabled={state === "loading" || state === "locating"}
          title="Use my current location"
          style={{ zIndex: 400 }}
          className="absolute right-2 top-[88px] flex items-center gap-1.5
            bg-zinc-950/90 border border-white/15 hover:border-white/30
            px-2.5 py-1.5 text-[11px] text-zinc-300 hover:text-white
            disabled:opacity-40 disabled:cursor-not-allowed
            transition-colors cursor-pointer select-none"
        >
          {state === "locating" ? (
            <><Spin /><span>Locating…</span></>
          ) : (
            <>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" className="shrink-0">
                <circle cx="12" cy="12" r="3" />
                <path strokeLinecap="round"
                  d="M12 2v3m0 14v3M2 12h3m14 0h3" />
                <path strokeLinecap="round"
                  d="M12 5a7 7 0 017 7 7 7 0 01-7 7 7 7 0 01-7-7 7 7 0 017-7z"
                  strokeOpacity="0.4" />
              </svg>
              <span>My location</span>
            </>
          )}
        </button>

        {/* First-tap hint */}
        {state === "idle" && !hint && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 pointer-events-none
            bg-zinc-950/80 border border-white/10 px-3 py-1.5
            text-[10px] text-zinc-400 whitespace-nowrap" style={{ zIndex: 400 }}>
            Click map to pick location
          </div>
        )}

        {/* Geocoding spinner overlay */}
        {state === "loading" && (
          <div className="absolute bottom-2 left-2 right-2
            bg-zinc-950/90 border border-white/8 px-3 py-1.5
            text-[11px] text-zinc-400 flex items-center gap-2"
            style={{ zIndex: 400 }}>
            <Spin /> Geocoding…
          </div>
        )}

        {/* Result / error badge */}
        {state !== "loading" && state !== "locating" && hint && (
          <div className={`absolute bottom-2 left-2 right-2
            bg-zinc-950/90 border px-3 py-1.5 text-[11px]
            ${state === "error"
              ? "border-red-500/30 text-red-400"
              : "border-white/10 text-zinc-300"}`}
            style={{ zIndex: 400 }}>
            {hint}
          </div>
        )}
      </div>
    </>
  );
}
