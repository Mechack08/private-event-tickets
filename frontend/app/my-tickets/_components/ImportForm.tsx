"use client";

import { useState } from "react";

interface ImportFormProps {
  onImport: (json: string, eventName: string) => string | null;
  onDone: () => void;
}

export function ImportForm({ onImport, onDone }: ImportFormProps) {
  const [importJson, setImportJson] = useState("");
  const [importEventName, setImportEventName] = useState("");
  const [importError, setImportError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setImportError(null);
    const err = onImport(importJson, importEventName);
    if (err) {
      setImportError(err);
    } else {
      setImportJson("");
      setImportEventName("");
      onDone();
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-8 border border-white/8 bg-white/[0.02] px-5 py-5 space-y-4"
    >
      <p className="text-sm font-semibold text-white">Import ticket secret</p>
      <div>
        <label
          htmlFor="importName"
          className="block text-xs font-medium text-zinc-400 mb-2"
        >
          Event name{" "}
          <span className="text-zinc-600 font-normal">(optional)</span>
        </label>
        <input
          id="importName"
          type="text"
          placeholder="e.g. DevCon 2026"
          value={importEventName}
          onChange={(e) => setImportEventName(e.target.value)}
          className="w-full bg-white/[0.03] border border-white/8 px-4 py-3 text-sm text-white placeholder-zinc-700 focus:outline-none focus:border-white/30 transition-colors"
        />
      </div>
      <div>
        <label
          htmlFor="importJson"
          className="block text-xs font-medium text-zinc-400 mb-2"
        >
          Ticket secret JSON
        </label>
        <textarea
          id="importJson"
          rows={4}
          placeholder={'{\n  "contractAddress": "0x…",\n  "nonce": "0x…"\n}'}
          value={importJson}
          onChange={(e) => setImportJson(e.target.value)}
          required
          className="w-full bg-white/[0.03] border border-white/8 px-4 py-3 text-xs text-white font-mono placeholder-zinc-700 focus:outline-none focus:border-white/30 transition-colors resize-none"
        />
      </div>
      {importError && (
        <p className="text-xs text-red-400">{importError}</p>
      )}
      <button
        type="submit"
        className="w-full bg-white text-black text-sm font-semibold py-3 hover:bg-zinc-100 transition-colors"
      >
        Save Ticket
      </button>
    </form>
  );
}
