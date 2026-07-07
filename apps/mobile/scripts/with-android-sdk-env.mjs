#!/usr/bin/env node

import { spawnSync } from "node:child_process";

import { withAndroidSdkEnv } from "./android-sdk-env.mjs";

const [command, ...args] = process.argv.slice(2);

if (!command) {
  console.error("Usage: node scripts/with-android-sdk-env.mjs <command> [...args]");
  process.exit(1);
}

let env;

try {
  env = withAndroidSdkEnv();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const result = spawnSync(command, args, {
  env,
  shell: process.platform === "win32",
  stdio: "inherit",
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
