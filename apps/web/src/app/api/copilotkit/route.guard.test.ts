import { describe, expect, it, vi } from "vitest";
import { isPublicCopilotPath } from "./guard";

describe("isPublicCopilotPath", () => {
  it.each([
    "/api/copilotkit/agent/resume/run",
    "/api/copilotkit/agent/resume/connect",
    "/api/copilotkit/info",
  ])("allows %s without auth", (path) => {
    expect(isPublicCopilotPath(path)).toBe(true);
  });

  it.each([
    "/api/copilotkit/agent/travel/run",
    "/api/copilotkit/agent/grocery/run",
    "/api/copilotkit/agent/trends/run",
    "/api/copilotkit",
    "/api/copilotkit/agent/resumefake/run",
  ])("requires auth for %s", (path) => {
    expect(isPublicCopilotPath(path)).toBe(false);
  });

  it("allows protected agent paths in offline agent test mode", async () => {
    vi.stubEnv("AGENT_TEST_MODE", "offline");
    vi.resetModules();

    const { isPublicCopilotPath: isOfflinePublicCopilotPath } = await import("./guard");

    expect(isOfflinePublicCopilotPath("/api/copilotkit/agent/travel/run")).toBe(true);

    vi.unstubAllEnvs();
  });
});
