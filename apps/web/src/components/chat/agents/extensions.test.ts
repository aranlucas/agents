import { describe, expect, it, vi } from "vitest";

// The shared Trends catalog pulls in lit/CSS styles via @copilotkit/a2ui-renderer.
// This contract test only checks that extensions.tsx wires the same catalog
// reference into CopilotKit, so stub the renderer module to keep jsdom import-free.
// The catalog's own behaviour is covered by catalog.dom.test.tsx.
vi.mock("@copilotkit/a2ui-renderer", () => ({
  createCatalog: () => ({ __stub: "trends-catalog" }),
}));

// extensions.tsx derives `ComponentProps<typeof CopilotKit>` from this module;
// react-core's v2 entry ships a CSS side-effect import that jsdom can't parse,
// so stub it to a no-op component with the same type shape.
vi.mock("@copilotkit/react-core/v2", () => ({
  CopilotKit: (() => null) as unknown as typeof import("@copilotkit/react-core/v2").CopilotKit,
}));

import { trendsCatalog } from "./trends/catalog";
import { getAgentExtension } from "./extensions";

describe("agent extensions", () => {
  it("supplies the Trends catalog to CopilotKit", () => {
    expect(getAgentExtension("trends")?.copilotKitProps?.a2ui).toMatchObject({
      catalog: trendsCatalog,
    });
  });

  it("does not enable A2UI provider props for unrelated agents", () => {
    expect(getAgentExtension("resume")?.copilotKitProps?.a2ui).toBeUndefined();
  });

  it("registers the Resume role-fit artifact without adding shared workspace branches", () => {
    expect(getAgentExtension("resume")?.Artifact).toBeDefined();
    expect(getAgentExtension("research")?.Artifact).toBeUndefined();
  });
});
