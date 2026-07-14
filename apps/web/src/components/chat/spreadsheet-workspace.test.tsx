// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@copilotkit/react-core/v2", () => ({
  CopilotSidebar: () => null,
  UseAgentUpdate: { OnStateChanged: "state", OnRunStatusChanged: "run" },
  useAgent: () => ({
    agent: {
      state: {
        active_sheet_index: 0,
        sheets: [
          { title: "First", rows: [["Name"], ["first-row"]] },
          { title: "Second", rows: [["Name"], ["second-row"]] },
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
  getAgentConfig: () => ({ colorVar: "--spreadsheet", placeholder: "Build a sheet" }),
}));
vi.mock("./app-sidebar", () => ({ AppSidebar: () => null }));
vi.mock("./console-top-bar", () => ({ ConsoleTopBar: () => null }));
vi.mock("./use-new-thread", () => ({ useNewThread: () => vi.fn() }));
vi.mock("@/lib/css", () => ({ cssVars: () => undefined }));

import { SpreadsheetWorkspace } from "./spreadsheet-workspace";

describe("SpreadsheetWorkspace", () => {
  it("switches sheets locally even when agent state selects another sheet", () => {
    render(<SpreadsheetWorkspace threadId="thread-1" />);
    expect(screen.getByText("first-row")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Second" }));

    expect(screen.getByText("second-row")).toBeInTheDocument();
    expect(screen.queryByText("first-row")).not.toBeInTheDocument();
  });
});
