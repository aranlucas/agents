// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

const addMessage = vi.fn();

vi.mock("@copilotkit/react-core/v2", () => ({
  CopilotSidebar: () => null,
  UseAgentUpdate: { OnStateChanged: "state", OnRunStatusChanged: "run" },
  useAgent: () => ({
    agent: {
      addMessage,
      state: {
        active_slide_index: 0,
        theme: "light",
        title: "Demo deck",
        slides: [
          { id: "one", type: "content", heading: "First", body: "first-body", notes: "" },
          { id: "two", type: "content", heading: "Second", body: "second-body", notes: "" },
        ],
      },
    },
  }),
}));

vi.mock("@agents/ui", () => ({
  cn: (...values: Array<string | false | undefined>) => values.filter(Boolean).join(" "),
  ScrollArea: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SidebarInset: ({ children }: { children: ReactNode }) => <main>{children}</main>,
  SidebarProvider: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SidebarTrigger: () => <button type="button">Toggle sidebar</button>,
  Streamdown: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("./agents/registry", () => ({
  getAgentConfig: () => ({ colorVar: "--presentation", placeholder: "Build slides" }),
}));
vi.mock("./app-sidebar", () => ({ AppSidebar: () => null }));
vi.mock("./console-top-bar", () => ({ ConsoleTopBar: () => null }));
vi.mock("./use-new-thread", () => ({ useNewThread: () => vi.fn() }));
vi.mock("@/lib/css", () => ({ cssVars: () => undefined }));

import { PresentationWorkspace } from "./presentation-workspace";

describe("PresentationWorkspace", () => {
  it("switches slides locally without sending an LLM prompt", () => {
    render(<PresentationWorkspace threadId="thread-1" />);
    expect(screen.getByText("first-body")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Slide 2 Second/ }));

    expect(screen.getByText("second-body")).toBeInTheDocument();
    expect(screen.queryByText("first-body")).not.toBeInTheDocument();
    expect(addMessage).not.toHaveBeenCalled();
  });
});
