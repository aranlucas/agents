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
      { find: "@legendapp/list", replacement: resolve(__dirname, "./test/legend-list-stub.tsx") },
      { find: "@", replacement: resolve(__dirname, "./src") },
    ],
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}", "test/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}"],
    },
  },
});
