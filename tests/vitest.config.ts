import { defineConfig } from "vitest/config";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    globals: true,
    // Tests run in Node.js (no DOM/browser required)
    environment: "node",
    // Show individual test names in output
    reporters: ["verbose"],
    // Give each test suite up to 30 s (circuit simulation is fast, but
    // initialState() calls compact-runtime WASM which can take a moment)
    testTimeout: 30_000,
  },
  resolve: {
    alias: {
      // Point directly at the generated ESM contract module
      "@contract": path.resolve(__dirname, "../generated/contract/index.js"),
    },
  },
});
