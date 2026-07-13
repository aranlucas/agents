import { describe, expect, it } from "vitest";

import { getAgentExtension } from "./extensions";

describe("agent extensions", () => {
  it("does not register a Trends A2UI extension", () => {
    expect(getAgentExtension("trends")).toBeUndefined();
  });

  it("registers the Resume role-fit artifact without adding shared workspace branches", () => {
    expect(getAgentExtension("resume")?.Artifact).toBeDefined();
    expect(getAgentExtension("research")?.Artifact).toBeUndefined();
  });

  it("keeps the Oral Boards client-tool mount", () => {
    expect(getAgentExtension("oral-boards")?.Mount).toBeDefined();
  });
});
