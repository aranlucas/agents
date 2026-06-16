import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "vitest";

const projectDir = join(dirname(fileURLToPath(import.meta.url)), "..");

function readExpoConfig(extraEnv: Record<string, string>) {
  const result = spawnSync("npx", ["expo", "config", "--json"], {
    cwd: projectDir,
    encoding: "utf8",
    env: {
      ...process.env,
      ...extraEnv,
    },
  });

  assert.equal(result.status, 0, result.stderr ?? result.stdout);
  return JSON.parse(result.stdout) as { extra?: Record<string, string> };
}

describe("Expo app config", () => {
  it("embeds Clerk and CopilotKit runtime values from EAS environment variables", () => {
    const config = readExpoConfig({
      EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_eas",
      EXPO_PUBLIC_COPILOTKIT_RUNTIME_URL: "https://app.example.com/api/copilotkit",
      EXPO_PUBLIC_AGENTS_BASE_URL: "https://agents.example.com",
    });

    assert.equal(config.extra?.clerkPublishableKey, "pk_test_eas");
    assert.equal(config.extra?.copilotKitRuntimeUrl, "https://app.example.com/api/copilotkit");
    assert.equal(config.extra?.agentsBaseUrl, "https://agents.example.com");
  });
});
