import type { ComponentProps } from "react";
import { describe, it, vi } from "vitest";
import { renderSmoke, interactSmoke } from "@/test/test-utils";

vi.mock("@agents/ui/components/input", () => ({
  Input: (props: ComponentProps<"input">) => <input {...props} />,
}));

vi.mock("@copilotkit/react-core/v2", () => ({
  useAgentContext: vi.fn(),
}));

import { PreferencesPanel } from "./preferences-panel";

describe("PreferencesPanel", () => {
  it("renders", async () => {
    await renderSmoke("preferences", <PreferencesPanel />);
  });

  it("interacts without throwing", async () => {
    await interactSmoke("preferences", <PreferencesPanel />);
  });
});
