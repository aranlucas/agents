import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  timeout: 30_000,
  use: {
    baseURL: process.env.STARTER_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
  },
});
