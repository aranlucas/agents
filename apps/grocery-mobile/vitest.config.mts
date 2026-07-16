import path from "node:path";
import { reactNative } from "vitest-native";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    reactNative({ engine: "native", platform: "android" }),
    {
      name: "grocery-mobile-test-setup",
      enforce: "post",
      config: () => ({ test: { setupFiles: ["./test/setup.ts"] } }),
    },
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["test/**/*.test.{ts,tsx}"],
    clearMocks: true,
    restoreMocks: true,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["src/lib/**/*.ts"],
      exclude: ["src/lib/config.ts", "src/**/*.test.{ts,tsx}"],
    },
  },
});
