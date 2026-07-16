import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "react-native": resolve(__dirname, "./test/react-native-stub.ts"),
    },
  },
  test: {
    environment: "node",
  },
});
