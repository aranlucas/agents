import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { getAgentsBaseUrl, getCopilotKitRuntimeBaseUrl } from "./agent-config-core";

describe("getCopilotKitRuntimeBaseUrl", () => {
  it("normalizes the configured runtime", () => {
    assert.equal(
      getCopilotKitRuntimeBaseUrl({}, "ios", {
        EXPO_PUBLIC_COPILOTKIT_RUNTIME_URL: "https://app.example.com/api/copilotkit/",
      }),
      "https://app.example.com/api/copilotkit",
    );
  });

  it("maps localhost to the Android emulator host", () => {
    assert.equal(
      getCopilotKitRuntimeBaseUrl({}, "android", {
        EXPO_PUBLIC_COPILOTKIT_RUNTIME_URL: "http://localhost:3000/api/copilotkit",
      }),
      "http://10.0.2.2:3000/api/copilotkit",
    );
  });
});

describe("getAgentsBaseUrl", () => {
  it("uses the configured gateway without an agent path", () => {
    assert.equal(
      getAgentsBaseUrl({}, "ios", {
        EXPO_PUBLIC_AGENTS_BASE_URL: "https://agents.example.com/",
      }),
      "https://agents.example.com",
    );
  });

  it("maps localhost to the Android emulator host", () => {
    assert.equal(getAgentsBaseUrl({}, "android", {}), "http://10.0.2.2:8000");
  });
});
