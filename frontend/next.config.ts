import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ── Turbopack module aliases ──────────────────────────────────────────────
  //
  // 1. isomorphic-ws: @midnight-ntwrk packages use isomorphic-ws for
  //    WebSocket support.  The default package tries to require("ws") in
  //    non-browser environments; our shim always exports the browser native
  //    WebSocket so Turbopack bundles correctly.
  //
  // 2. fs: @midnight-ntwrk/ledger-v8 (and some transitive dependencies)
  //    reference the `fs` module.  In the browser bundle we shim it to an
  //    empty object so the import resolves without crashing.  Real file I/O
  //    is never reached in the browser because these modules are only loaded
  //    via dynamic import() inside async handlers (never during SSR).
  turbopack: {
    resolveAlias: {
      "isomorphic-ws": "./shims/isomorphic-ws.js",
      fs: "./shims/empty.js",
    },
  },

  // Disable x-powered-by header
  poweredByHeader: false,
};

export default nextConfig;
