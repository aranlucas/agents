import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

// Pure-logic unit tests only. `react-native` is aliased to a small Node stub so
// modules that import `StyleSheet`/`Platform` can run outside the RN runtime.
export default defineConfig({
  resolve: {
    alias: [
      {
        find: "react-native/Libraries/Core/InitializeCore",
        replacement: resolve(__dirname, "./test/empty-stub.ts"),
      },
      { find: "expo/fetch", replacement: resolve(__dirname, "./test/expo-fetch-stub.ts") },
      { find: "react-native", replacement: resolve(__dirname, "./test/react-native-stub.ts") },
      // Deprecated CJS polyfill (see test/text-encoding-stub.ts): no ESM named
      // exports for Node to bind. Redirected to node:util globals.
      { find: /^text-encoding$/, replacement: resolve(__dirname, "./test/text-encoding-stub.ts") },
      { find: "@", replacement: resolve(__dirname, "./src") },
    ],
  },
  test: {
    // Bound memory and CPU use when running validation on a development machine.
    maxWorkers: 1,
    server: {
      // Inline the whole chain down to the broken package (vitest docs): the
      // real CopilotKit package whose polyfills import the deprecated
      // `text-encoding` CJS, which Node cannot bind ESM names from. Inlined
      // modules go through Vite, where the alias above redirects it to the
      // node:util stub. `react-native` itself stays stubbed via its alias.
      deps: { inline: [/@copilotkit\/react-native/, "text-encoding"] },
    },
    environment: "node",
    testTimeout: 30_000,
    include: ["src/**/*.test.{ts,tsx}", "test/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}"],
    },
  },
});
