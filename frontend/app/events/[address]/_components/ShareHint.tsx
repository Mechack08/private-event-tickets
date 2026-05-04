"use client";

import { useState } from "react";

interface ShareHintProps {
  address: string;
}

/** Displays the event URL with a one-click copy button. */
export function ShareHint({ address }: ShareHintProps) {
  const [copied, setCopied] = useState(false);

  const url =
    typeof window !== "undefined"
      ? `${window.location.origin}/events/${encodeURIComponent(address)}`
      : "";

  function copy() {
    if (url) {
      navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div className="mt-6 rounded-xl border border-white/6 bg-white/2 px-4 py-3 flex items-center justify-between gap-3">
      <p className="text-xs text-zinc-600 truncate">Share event URL with attendees</p>
      <button
        onClick={copy}
        className="shrink-0 text-xs text-zinc-500 hover:text-white transition-colors"
      >
        {copied ? "Copied!" : "Copy link"}
      </button>
    </div>
  );
}
