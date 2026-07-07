import { describe, expect, it, vi } from "vitest";

vi.mock("@copilotkit/react-core/v2", () => ({
  useAgent: () => ({ agent: undefined }),
  useHumanInTheLoop: () => undefined,
  UseAgentUpdate: { OnRunStatusChanged: "OnRunStatusChanged" },
}));

import { GROCERY_APPROVAL_DESCRIPTION } from "./approval";

describe("approval tool descriptions", () => {
  it("describes grocery approval as live Kroger cart mutation", () => {
    expect(GROCERY_APPROVAL_DESCRIPTION).toContain("live Kroger cart");
    expect(GROCERY_APPROVAL_DESCRIPTION).not.toContain("add items to cart");
  });
});
