import { describe, expect, it } from "vitest";
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
    "/api/copilotkit/agent/a2ui/run",
    "/api/copilotkit",
    "/api/copilotkit/agent/resumefake/run",
  ])("requires auth for %s", (path) => {
    expect(isPublicCopilotPath(path)).toBe(false);
  });
});
