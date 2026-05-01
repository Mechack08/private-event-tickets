"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  onScan: (result: string) => boolean; // return true if consumed, false to keep scanning
  onError?: (err: string) => void;
}

let _counter = 0;

export default function QrScannerWidget({ onScan, onError }: Props) {
  const divId = useRef(`qr-scan-${++_counter}`).current;
  const startedRef = useRef(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scannerRef = useRef<any>(null);
  // Always call the latest onScan/onError even though the effect runs once.
  const onScanRef = useRef(onScan);
  const onErrorRef = useRef(onError);
  useEffect(() => { onScanRef.current = onScan; }, [onScan]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);
  // Prevent firing more than once per scan session.
  const firedRef = useRef(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      try {
        await new Promise((r) => setTimeout(r, 100));
        if (cancelled) return;

        const { Html5Qrcode } = await import("html5-qrcode");
        if (cancelled) return;

        const el = document.getElementById(divId);
        if (!el) {
          const msg = "Scanner element not ready.";
          if (!cancelled) { setCameraError(msg); onErrorRef.current?.(msg); }
          return;
        }

        const scanner = new Html5Qrcode(divId, false);
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: "environment" },
          {
            fps: 10,
            // Responsive: 70% of the viewfinder, works on any size.
            qrbox: (w: number, h: number) => {
              const side = Math.floor(Math.min(w, h) * 0.7);
              return { width: side, height: side };
            },
          },
          (text) => {
            if (cancelled || firedRef.current) return;
            console.log("[QrScanner] decoded:", text);
            const consumed = onScanRef.current(text);
            if (consumed) firedRef.current = true;
          },
          () => { /* per-frame misses — ignore */ },
        );

        if (cancelled) {
          Promise.resolve(scanner.stop()).catch(() => {});
          Promise.resolve(scanner.clear()).catch(() => {});
          return;
        }
        startedRef.current = true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[QrScanner] start failed:", msg);
        if (!cancelled) { setCameraError(msg); onErrorRef.current?.(msg); }
      }
    }

    start();

    return () => {
      cancelled = true;
      if (startedRef.current && scannerRef.current) {
        startedRef.current = false;
        const s = scannerRef.current;
        scannerRef.current = null;
        Promise.resolve(s.stop()).catch(() => {}).finally(() => {
          Promise.resolve(s.clear()).catch(() => {});
        });
      } else {
        scannerRef.current = null;
      }
    };
  }, [divId]);

  if (cameraError) {
    return (
      <div className="w-full h-full flex items-center justify-center p-4">
        <p className="text-xs text-red-400 text-center">{cameraError}</p>
      </div>
    );
  }

  return <div id={divId} style={{ width: "100%", height: "100%" }} />;
}
