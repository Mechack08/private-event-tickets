"use client";

import { useState } from "react";
import { getCallerSecret } from "@/lib/storage";

interface OrganizerKeyExportProps {
  contractAddress: string;
  eventName: string;
}

/**
 * Displays a warning panel prompting the organizer to back up their ZK key,
 * with options to download it as a JSON file or copy the raw hex.
 */
export function OrganizerKeyExport({ contractAddress, eventName }: OrganizerKeyExportProps) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [downloaded, setDownloaded] = useState(false);

  const secretHex = getCallerSecret(contractAddress) ?? "";

  function downloadKey() {
    if (!secretHex) return;
    const payload = JSON.stringify(
      {
        version: 1,
        purpose: "Midnight Private Event Tickets — organizer key",
        contractAddress,
        eventName,
        callerSecretHex: secretHex,
        exportedAt: new Date().toISOString(),
      },
      null,
      2,
    );
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `organizer-key-${contractAddress.slice(0, 12)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setDownloaded(true);
    setTimeout(() => setDownloaded(false), 3000);
  }

  function copyKey() {
    if (!secretHex) return;
    navigator.clipboard.writeText(secretHex);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="mb-6 rounded-xl border border-amber-500/25 bg-amber-500/5 px-4 py-4">
      <div className="flex items-start gap-3">
        <span className="shrink-0 text-amber-400 text-base mt-px select-none">⚠</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-amber-300 mb-1">Back up your organizer key</p>
          <p className="text-xs text-amber-200/55 leading-relaxed mb-3">
            This key is stored only in this browser. Clearing browser data, using a different
            device, or a private-browsing session will lock you out of managing this event permanently.
          </p>

          {/* Key preview */}
          <div className="rounded-lg border border-white/8 bg-black/25 px-3 py-2.5 mb-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-zinc-500 font-medium">Organizer key</span>
              <button
                onClick={() => setRevealed((v) => !v)}
                className="text-xs text-zinc-500 hover:text-white transition-colors"
              >
                {revealed ? "Hide" : "Reveal"}
              </button>
            </div>
            {revealed ? (
              <p className="text-xs font-mono text-zinc-300 break-all select-all leading-relaxed">
                {secretHex || "—"}
              </p>
            ) : (
              <p className="text-xs font-mono text-zinc-600 break-all select-none leading-relaxed tracking-widest">
                {"•".repeat(Math.min(secretHex.length, 64))}
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={downloadKey}
              disabled={!secretHex}
              className="flex-1 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 disabled:opacity-40 text-black text-xs font-semibold py-2 rounded-lg transition-colors"
            >
              {downloaded ? "Downloaded ✓" : "Export .json"}
            </button>
            <button
              onClick={copyKey}
              disabled={!secretHex}
              className="px-3.5 border border-white/12 text-zinc-400 text-xs hover:text-white hover:border-white/25 disabled:opacity-40 rounded-lg transition-colors"
            >
              {copied ? "Copied!" : "Copy hex"}
            </button>
          </div>

          <p className="text-xs text-amber-200/35 mt-2.5 leading-relaxed">
            Store the exported file somewhere secure — a password manager, encrypted notes, or an offline backup.
          </p>
        </div>
      </div>
    </div>
  );
}
