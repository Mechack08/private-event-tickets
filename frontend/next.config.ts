import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // ── Webpack (--webpack mode) ─────────────────────────────────────────────
  webpack(config) {
    config.resolve = config.resolve ?? {};

    // KEY FIX: do NOT follow symlinks when computing module identity.
    // pnpm symlinks frontend/node_modules/@midnight-ntwrk/* → .pnpm/<pkg>/
    // inner stores. When webpack follows those symlinks it ends up in a context
    // where many cross-package peers are absent. Setting symlinks=false means
    // webpack treats "frontend/node_modules/@pkg/foo" as the file's home and
    // walks UP from there to find siblings – which are all present in
    // frontend/node_modules/.
    config.resolve.symlinks = false;

    // Guarantee frontend/node_modules is the FIRST search root for ALL bare
    // specifiers, including those imported transitively from inside the sdk/
    // or node_modules packages.
    config.resolve.modules = [
      path.resolve(__dirname, "node_modules"),
      ...(Array.isArray(config.resolve.modules)
        ? config.resolve.modules
        : ["node_modules"]),
    ];

    // Ensure the 'import' condition is active for ALL module resolutions.
    // @midnight-ntwrk/compact-js and similar packages ship only dist/esm/ — they
    // have NO dist/cjs/. Their exports map's "default" condition points to a
    // missing CJS file. When the resolution comes from a CJS require() inside
    // midnight-js-contracts, webpack normally doesn't activate the 'import'
    // condition, so it falls through to "default" → missing file → Module not found.
    // Adding 'import' globally ensures the esm entry is preferred.
    const existingConditions = Array.isArray(config.resolve.conditionNames)
      ? (config.resolve.conditionNames as string[])
      : [];
    if (!existingConditions.includes("import")) {
      config.resolve.conditionNames = ["import", ...existingConditions];
    }

    config.resolve.alias = {
      ...(config.resolve.alias as Record<string, string>),
      // SDK source modules (sibling workspace package)
      "@sdk/providers": path.resolve(__dirname, "../sdk/src/providers.ts"),
      "@sdk/contract-api": path.resolve(__dirname, "../sdk/src/contract-api.ts"),
      "@sdk/types": path.resolve(__dirname, "../sdk/src/types.ts"),
      // Browser-safe WebSocket shim
      "isomorphic-ws": path.resolve(__dirname, "shims/isomorphic-ws.js"),
    };

    // Stub Node built-ins that Midnight packages reference but never actually
    // use in browser bundles.
    config.resolve.fallback = {
      ...(config.resolve.fallback as Record<string, unknown>),
      fs: false,
      path: false,
      crypto: false,
    };

    // Enable WebAssembly support required by @midnight-ntwrk/ledger-v8
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
    };

    // Register .wasm files from node_modules as async WebAssembly modules
    // (scoped to node_modules so it doesn't conflict with Next's edge-runtime wasm loader)
    config.module = config.module ?? {};
    config.module.rules = (config.module.rules as unknown[]) ?? [];
    (config.module.rules as unknown[]).push({
      test: /\.wasm$/,
      include: /node_modules/,
      type: "webassembly/async",
    });

    return config;
  },

  poweredByHeader: false,
};

export default nextConfig;
