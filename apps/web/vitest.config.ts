import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
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
        statements: 90,
        branches: 75,
        functions: 90,
        lines: 90,
      },
    },
  },
});
