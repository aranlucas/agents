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
  it("builds agent urls from the single base url", () => {
    assert.equal(
      getAgentUrl("travel", {}, "ios", {
        EXPO_PUBLIC_AGENTS_BASE_URL: "https://agents.example.com",
      }),
      "https://agents.example.com/travel/agui",
    );
  });

  it("uses shared backend paths when agent ids differ from gateway mounts", () => {
    assert.equal(
      getAgentUrl("oral-boards", {}, "ios", {
        EXPO_PUBLIC_AGENTS_BASE_URL: "https://agents.example.com",
      }),
      "https://agents.example.com/oralboards/agui",
    );
  });

  it("defaults to localhost:8000 with the agent prefix", () => {
    assert.equal(getAgentUrl("grocery", {}, "ios", {}), "http://localhost:8000/grocery/agui");
    assert.equal(getAgentUrl("grocery", {}, "android", {}), "http://10.0.2.2:8000/grocery/agui");
  });

  it("maps configured localhost base URLs to the Android emulator host", () => {
    assert.equal(
      getAgentUrl("travel", { agentsBaseUrl: "http://localhost:8000/" }, "android"),
      "http://10.0.2.2:8000/travel/agui",
    );
  });

  it("prefers environment base URLs over app defaults", () => {
    assert.equal(
      getAgentUrl("grocery", { agentsBaseUrl: "http://localhost:8000/" }, "android", {
        EXPO_PUBLIC_AGENTS_BASE_URL: "https://agents.example.com",
      }),
      "https://agents.example.com/grocery/agui",
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
          agentsBaseUrl: "https://agents-production.up.railway.app",
        },
        "ios",
        { EXPO_PUBLIC_COPILOTKIT_RUNTIME_URL: "" },
      ),
      "https://agents-production.up.railway.app/a2ui/agui",
    );
  });

  it("lets explicit localhost base URLs override prod direct URLs", () => {
    assert.equal(
      getAgentUrl("a2ui", { agentsBaseUrl: "https://agents-production.up.railway.app" }, "ios", {
        EXPO_PUBLIC_COPILOTKIT_RUNTIME_URL: "",
        EXPO_PUBLIC_AGENTS_BASE_URL: "http://localhost:8000",
      }),
      "http://localhost:8000/a2ui/agui",
    );
  });
});
