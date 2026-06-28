import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [
      {
        find: "@agents/ui/globals.css",
        replacement: resolve(__dirname, "../../packages/ui/src/styles/globals.css"),
      },
      {
        find: "@agents/ui",
        replacement: resolve(__dirname, "../../packages/ui/src"),
      },
      { find: "@", replacement: resolve(__dirname, "./src") },
    ],
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.dom.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    // `*.contract.test.tsx` files are compile-time type contracts checked by tsc
    // (they import React components that pull in CSS), not runtime Vitest specs.
    exclude: ["**/node_modules/**", "**/*.contract.test.tsx"],
    coverage: {
      provider: "v8",
      reporter: ["text"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/**/*.contract.test.tsx"],
      thresholds: {
        statements: 45,
        branches: 50,
        functions: 45,
        lines: 45,
      },
    },
  },
});
