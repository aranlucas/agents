import { describe, expect, it } from "vitest";

import { getAgentExtension } from "./extensions";

describe("agent extensions", () => {
  it("registers the native Trends artifact without restoring A2UI", () => {
    expect(getAgentExtension("trends")?.Artifact).toBeDefined();
    expect(getAgentExtension("trends")?.Mount).toBeUndefined();
  });

  it("registers the Resume role-fit artifact without shared workspace branches", () => {
    expect(getAgentExtension("resume")?.Mount).toBeUndefined();
    expect(getAgentExtension("resume")?.Artifact).toBeDefined();
    expect(getAgentExtension("research")?.Artifact).toBeUndefined();
  });

  it("keeps the Oral Boards client-tool mount", () => {
    expect(getAgentExtension("oral-boards")?.Mount).toBeDefined();
  });
});
