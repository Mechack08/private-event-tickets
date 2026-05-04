"use client";

import { useState } from "react";
import { saveCallerSecret } from "@/lib/storage";

interface OrganizerKeyImportProps {
  contractAddress: string;
  eventName: string;
  onImported: () => void;
}

/**
 * Lets an organizer restore access on a new device / browser by pasting their
 * hex key or uploading an exported .json backup file.
 */
export function OrganizerKeyImport({
  contractAddress,
  eventName,
  onImported,
}: OrganizerKeyImportProps) {
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  function tryImport(raw: string) {
    setError(null);
    const trimmed = raw.trim();
    if (!trimmed) return;

    let secretHex: string | null = null;

    if (trimmed.startsWith("0x") || /^[0-9a-f]{64}$/i.test(trimmed)) {
      secretHex = trimmed.startsWith("0x") ? trimmed : "0x" + trimmed;
    } else {
      try {
        const parsed = JSON.parse(trimmed) as Record<string, unknown>;
        if (typeof parsed.callerSecretHex === "string") {
          secretHex = parsed.callerSecretHex;
        } else {
          throw new Error("No callerSecretHex field found.");
        }
      } catch {
        setError("Couldn't read the key. Paste the hex string or the full exported .json.");
        return;
      }
    }

    const hex = secretHex!.replace(/^0x/, "");
    if (!/^[0-9a-f]+$/i.test(hex) || hex.length < 8) {
      setError("The key doesn't look valid — check you copied the full value.");
      return;
    }

    saveCallerSecret(contractAddress, secretHex!);
    onImported();
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = (ev.target?.result as string) ?? "";
      setInput(text);
      tryImport(text);
    };
    reader.readAsText(file);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-blue-500/25 bg-blue-500/5 px-4 py-4">
        <div className="flex items-start gap-3">
          <span className="shrink-0 text-blue-400 text-base mt-px select-none">🔑</span>
          <div>
            <p className="text-sm font-semibold text-blue-300 mb-1">Organizer key required</p>
            <p className="text-xs text-blue-200/55 leading-relaxed">
              You&apos;re the host of{" "}
              <span className="text-white font-medium">{eventName || contractAddress}</span> but
              the organizer key isn&apos;t saved in this browser. Paste your hex key or upload the
              exported <code className="text-blue-300">.json</code> backup file.
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-white/8 bg-white/[0.02] px-5 py-5 space-y-4">
        <p className="text-sm font-semibold text-white">Import organizer key</p>

        {/* File upload */}
        <label className="flex items-center justify-center gap-2 border border-dashed border-white/15 rounded-lg py-4 cursor-pointer hover:border-white/30 hover:bg-white/[0.02] transition-colors">
          <svg className="w-4 h-4 text-zinc-500" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
          </svg>
          <span className="text-xs text-zinc-400">Upload <code className="text-zinc-300">organizer-key-….json</code></span>
          <input type="file" accept=".json,application/json" className="hidden" onChange={handleFile} />
        </label>

        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-white/8" />
          <span className="text-xs text-zinc-600">or paste</span>
          <div className="flex-1 h-px bg-white/8" />
        </div>

        <textarea
          rows={3}
          placeholder="Paste hex key (0x…) or full exported JSON"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="w-full bg-white/[0.03] border border-white/8 px-4 py-3 text-xs text-white font-mono placeholder-zinc-700 focus:outline-none focus:border-white/30 transition-colors resize-none rounded-lg"
        />

        {error && <p className="text-xs text-red-400">{error}</p>}

        <button
          onClick={() => tryImport(input)}
          disabled={!input.trim()}
          className="w-full bg-white text-black text-sm font-semibold py-2.5 rounded-xl hover:bg-zinc-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          Restore access
        </button>
      </div>
    </div>
  );
}
