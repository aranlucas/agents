import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { getAgentUrl, normalizeAguiUrl, normalizeCopilotKitRuntimeUrl } from "./agent-config-core";

describe("normalizeAguiUrl", () => {
  it("adds the AG-UI path to a base agent URL", () => {
    assert.equal(normalizeAguiUrl("https://travel.example.com"), "https://travel.example.com/agui");
  });

  it("does not duplicate the AG-UI path", () => {
    assert.equal(
      normalizeAguiUrl("https://travel.example.com/agui/"),
      "https://travel.example.com/agui",
    );
  });
});

describe("normalizeCopilotKitRuntimeUrl", () => {
  it("targets the CopilotKit multi-route run endpoint", () => {
    assert.equal(
      normalizeCopilotKitRuntimeUrl("https://app.example.com/api/copilotkit/", "wellness"),
      "https://app.example.com/api/copilotkit/agent/wellness/run",
    );
  });
});

describe("getAgentUrl", () => {
  it("uses the Android emulator host for local development defaults", () => {
    assert.equal(getAgentUrl("fitness", {}, "android"), "http://10.0.2.2:8002/agui");
  });

  it("maps configured localhost URLs to the Android emulator host", () => {
    assert.equal(
      getAgentUrl("travel", { travel: "http://localhost:8000/" }, "android"),
      "http://10.0.2.2:8000/agui",
    );
  });

  it("prefers environment URLs over app defaults", () => {
    assert.equal(
      getAgentUrl("grocery", { grocery: "http://localhost:8001/" }, "android", {
        EXPO_PUBLIC_GROCERY_AGENT_URL: "https://grocery.example.com",
      }),
      "https://grocery.example.com/agui",
    );
  });

  it("prefers the CopilotKit runtime over direct agent URLs", () => {
    assert.equal(
      getAgentUrl("a2ui", { a2ui: "http://localhost:8004/" }, "ios", {
        EXPO_PUBLIC_COPILOTKIT_RUNTIME_URL: "https://app.example.com/api/copilotkit",
      }),
      "https://app.example.com/api/copilotkit/agent/a2ui/run",
    );
  });

  it("maps a local CopilotKit runtime URL to the Android emulator host", () => {
    assert.equal(
      getAgentUrl("travel", {}, "android", {
        EXPO_PUBLIC_COPILOTKIT_RUNTIME_URL: "http://localhost:3000/api/copilotkit",
      }),
      "http://10.0.2.2:3000/api/copilotkit/agent/travel/run",
    );
  });

  it("lets an explicit empty runtime environment value use direct prod URLs", () => {
    assert.equal(
      getAgentUrl(
        "a2ui",
        {
          copilotKitRuntimeUrl: "https://app.example.com/api/copilotkit",
          a2ui: "https://agents-a2ui-production.up.railway.app",
        },
        "ios",
        { EXPO_PUBLIC_COPILOTKIT_RUNTIME_URL: "" },
      ),
      "https://agents-a2ui-production.up.railway.app/agui",
    );
  });

  it("lets explicit localhost agent URLs override prod direct URLs", () => {
    assert.equal(
      getAgentUrl(
        "a2ui",
        { a2ui: "https://agents-a2ui-production.up.railway.app" },
        "ios",
        {
          EXPO_PUBLIC_COPILOTKIT_RUNTIME_URL: "",
          EXPO_PUBLIC_A2UI_AGENT_URL: "http://localhost:8004",
        },
      ),
      "http://localhost:8004/agui",
    );
  });
});
