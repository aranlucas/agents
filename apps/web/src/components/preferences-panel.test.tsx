import { render } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@agents/ui/components/input", () => ({
  Input: (props: ComponentProps<"input">) => <input {...props} />,
}));

vi.mock("@copilotkit/react-core/v2", () => ({
  useAgentContext: vi.fn(),
}));

import { PreferencesPanel } from "./preferences-panel";

describe("PreferencesPanel", () => {
  it("renders", () => {
    expect(() => render(<PreferencesPanel />)).not.toThrow();
  });
});
