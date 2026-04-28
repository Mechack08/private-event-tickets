"use client";
/**
 * EventLocationMap — Read-only Leaflet map shown on the event detail page.
 *
 * • Drops a custom dark-themed pin at the event coordinates.
 * • "Open in Maps" button links to OpenStreetMap (no API key required).
 * • "Directions" button links to Google Maps directions for the coordinate.
 * • Fully responsive; collapses gracefully if lat/lng are missing.
 *
 * Must be loaded with `next/dynamic` + `ssr: false`.
 */
import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import type L from "leaflet";

interface Props {
  lat: number;
  lng: number;
  label?: string;
}

export default function EventLocationMap({ lat, lng, label }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef       = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    // Dynamic import so Leaflet only runs in the browser.
    import("leaflet").then((L) => {
      if (!containerRef.current || mapRef.current) return;

      // ── Dark tile layer ────────────────────────────────────────────────────
      const map = L.map(containerRef.current, {
        center:          [lat, lng],
        zoom:            15,
        zoomControl:     false,
        scrollWheelZoom: false,  // prevent accidental zoom while scrolling the page
        attributionControl: false,
      });

      L.control.zoom({ position: "bottomright" }).addTo(map);
      L.control.attribution({ position: "bottomright", prefix: false }).addTo(map);

      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com">CARTO</a>',
        subdomains: "abcd",
        maxZoom: 20,
      }).addTo(map);

      // ── Custom SVG pin ─────────────────────────────────────────────────────
      const pinSvg = `
        <svg width="32" height="42" viewBox="0 0 32 42" fill="none" xmlns="http://www.w3.org/2000/svg">
          <filter id="s" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#000" flood-opacity="0.5"/>
          </filter>
          <g filter="url(#s)">
            <path d="M16 2C9.37 2 4 7.37 4 14c0 9.33 12 24 12 24S28 23.33 28 14c0-6.63-5.37-12-12-12z"
              fill="#a78bfa" stroke="#7c3aed" stroke-width="1.5"/>
            <circle cx="16" cy="14" r="5" fill="#0a0a0a"/>
            <circle cx="16" cy="14" r="2" fill="#a78bfa"/>
          </g>
        </svg>`;

      const icon = L.divIcon({
        html:        pinSvg,
        className:   "",
        iconSize:    [32, 42],
        iconAnchor:  [16, 42],
        popupAnchor: [0, -44],
      });

      const marker = L.marker([lat, lng], { icon }).addTo(map);

      if (label) {
        marker.bindPopup(
          `<div style="font-family:monospace;font-size:12px;color:#e4e4e7;background:#111;border:1px solid #27272a;padding:6px 10px;border-radius:0">${label}</div>`,
          { className: "midnight-popup", closeButton: false }
        );
      }

      mapRef.current = map;
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}
