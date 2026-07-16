import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

const platform = process.argv[2];

if (platform !== "android" && platform !== "ios") {
  throw new Error("Usage: node ./scripts/native-export.mjs <android|ios>");
}

const outputDirectory = `dist/${platform}-export`;
const output = join(process.cwd(), outputDirectory);
rmSync(output, { recursive: true, force: true });

const result = spawnSync(
  "pnpm",
  [
    "exec",
    "expo",
    "export",
    "--platform",
    platform,
    "--output-dir",
    outputDirectory,
    "--clear",
    "--max-workers",
    "2",
  ],
  {
    cwd: process.cwd(),
    env: {
      ...process.env,
      CI: "1",
      NODE_ENV: "production",
      EXPO_NO_DOTENV: "1",
      EXPO_NO_TELEMETRY: "1",
      EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_Y2xlcmsuZXhhbXBsZS5jb20k",
      EXPO_PUBLIC_COPILOTKIT_RUNTIME_URL: "https://example.invalid/copilotkit",
      EXPO_PUBLIC_GROCERY_MARKETING_URL: "https://example.invalid/grocery",
    },
    stdio: "inherit",
  },
);

if (result.status !== 0) process.exit(result.status ?? 1);

const metadata = join(output, "metadata.json");
const bundleRoot = join(output, "_expo", "static", "js", platform);

function hasBundle(directory) {
  if (!existsSync(directory)) return false;
  return readdirSync(directory, { withFileTypes: true }).some((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return hasBundle(path);
    return /\.(hbc|js)$/u.test(entry.name) && statSync(path).size > 0;
  });
}

if (!existsSync(metadata) || !hasBundle(bundleRoot)) {
  throw new Error(`${platform} export did not contain metadata and a non-empty bundle.`);
}

console.log(`Verified Grocery Mobile ${platform} export.`);
