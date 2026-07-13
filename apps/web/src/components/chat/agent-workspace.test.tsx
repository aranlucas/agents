import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  artifact: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@copilotkit/react-core/v2", () => ({
  UseAgentUpdate: { OnStateChanged: "state" },
  useAgent: () => ({
    agent: {
      state: {
        target_role: "Staff AI Platform Engineer",
        fit_summary: "Strong fit.",
        status: "ready",
      },
    },
  }),
}));

vi.mock("@agents/ui", () => ({
  SidebarProvider: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SidebarInset: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));

vi.mock("@/components/chat/agents/extensions", () => ({
  AgentExtensionSlot: () => null,
  getAgentExtension: () => ({
    Artifact: (props: { state: unknown; view: unknown }) => {
      mocks.artifact(props);
      return <div>RESUME_ARTIFACT</div>;
    },
  }),
}));

vi.mock("@/components/chat/agents/suggestions", () => ({
  AgentSuggestions: () => null,
}));

vi.mock("@/components/chat/app-sidebar", () => ({ AppSidebar: () => null }));
vi.mock("@/components/chat/artifact-panel", () => ({ ArtifactPanel: () => <div>GENERIC</div> }));
vi.mock("@/components/chat/chat-surface", () => ({ ChatSurface: () => <div>CHAT</div> }));
vi.mock("@/components/chat/use-new-thread", () => ({ useNewThread: () => vi.fn() }));
vi.mock("@/components/workspace-shell", () => ({
  useArtifactPanel: () => ({ state: "open", dispatch: vi.fn() }),
  WorkspaceShell: ({ artifact }: { artifact: ReactNode }) => <div>{artifact}</div>,
}));

import { AgentWorkspace } from "./agent-workspace";

describe("AgentWorkspace artifact extensions", () => {
  it("renders a registered agent artifact with the live state and selected view", () => {
    render(<AgentWorkspace agentId="resume" threadId="thread-1" />);

    expect(screen.getByText("RESUME_ARTIFACT")).toBeVisible();
    expect(screen.queryByText("GENERIC")).not.toBeInTheDocument();
    expect(mocks.artifact).toHaveBeenCalledWith(
      expect.objectContaining({
        state: expect.objectContaining({ target_role: "Staff AI Platform Engineer" }),
        view: expect.objectContaining({
          title: "Role fit brief",
          content: "Strong fit.",
          status: "ready",
        }),
      }),
    );
  });
});
