// @vitest-environment jsdom
import type { ReactElement } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  OralBoardsQuestionProvider,
  useOralBoardsQuestion,
} from "@/lib/copilotkit/oral-boards-question-context";

const stableAgent = {
  state: { current_question: "" },
  setState: vi.fn(),
};

vi.mock("@copilotkit/react-core/v2", () => ({
  UseAgentUpdate: { OnStateChanged: "OnStateChanged" },
  useAgent: () => ({ agent: stableAgent }),
  useDefaultRenderTool: vi.fn(),
  useFrontendTool: vi.fn(),
  useRenderTool: vi.fn(),
}));

vi.mock("@/lib/copilotkit/speak-question", () => ({
  speakQuestion: vi.fn().mockResolvedValue(undefined),
}));

import { useRenderTool } from "@copilotkit/react-core/v2";
import { OralBoardsExtension } from "./oral-boards";

type SearchDocsRenderArgs = {
  status: "inProgress" | "executing" | "complete";
  parameters?: { query?: string; collection?: string };
  result?: string;
};

function getSearchDocsRender(): (args: SearchDocsRenderArgs) => ReactElement {
  const call = vi
    .mocked(useRenderTool)
    .mock.calls.find(([config]) => (config as { name: string }).name === "search_docs");
  if (!call) throw new Error("search_docs was not registered via useRenderTool");
  return (call[0] as { render: (args: SearchDocsRenderArgs) => ReactElement }).render;
}

function CurrentQuestion() {
  const { currentQuestion } = useOralBoardsQuestion();
  return <output aria-label="Current question">{currentQuestion}</output>;
}

function Harness() {
  return (
    <OralBoardsQuestionProvider>
      <OralBoardsExtension agentId="oral-boards" />
      <CurrentQuestion />
    </OralBoardsQuestionProvider>
  );
}

describe("OralBoardsExtension", () => {
  it("mirrors current_question when a stable agent object receives state updates", () => {
    const { rerender } = render(<Harness />);

    stableAgent.state = {
      current_question: "What is your immediate management plan?",
    };
    rerender(<Harness />);

    expect(screen.getByLabelText("Current question")).toHaveTextContent(
      "What is your immediate management plan?",
    );
  });
});

// search_docs results are agent tool-call output — untrusted at the render
// boundary the same way agent state is. parseSearchOutput's isSearchResult
// filter is the guard; these tests exercise it end to end through the actual
// render callback registered with useRenderTool.
describe("search_docs tool renderer", () => {
  it("renders well-formed results and silently drops malformed entries", async () => {
    render(<Harness />);
    const renderSearchDocs = getSearchDocsRender();

    const resultPayload = JSON.stringify({
      results: [
        {
          title: "AAPD Guideline on Pulp Therapy",
          collection: "aapd",
          snippet: "Use «formocresol» sparingly in primary teeth.",
        },
        { title: "Missing collection and snippet" },
        { title: "Non-string snippet", collection: "abpd", snippet: 5 },
      ],
    });

    const { getByRole, getByText, queryByText } = render(
      renderSearchDocs({
        status: "complete",
        parameters: { query: "pulp therapy", collection: "aapd" },
        result: resultPayload,
      }),
    );

    // The Tool card is a Collapsible closed by default — open it to reach
    // the result rows in ToolContent.
    await userEvent.click(getByRole("button"));

    expect(getByText("AAPD Guideline on Pulp Therapy")).toBeInTheDocument();
    expect(getByText(/formocresol/)).toBeInTheDocument();
    expect(queryByText("Missing collection and snippet")).not.toBeInTheDocument();
    expect(queryByText("Non-string snippet")).not.toBeInTheDocument();
  });

  it("does not crash and shows no results on malformed JSON", () => {
    render(<Harness />);
    const renderSearchDocs = getSearchDocsRender();

    expect(() =>
      render(
        renderSearchDocs({
          status: "complete",
          parameters: { query: "pulp therapy" },
          result: "{not valid json",
        }),
      ),
    ).not.toThrow();
  });

  it("does not render result rows while the tool call is still in progress", () => {
    render(<Harness />);
    const renderSearchDocs = getSearchDocsRender();

    const { queryByText } = render(
      renderSearchDocs({
        status: "inProgress",
        parameters: { query: "pulp therapy" },
        result: JSON.stringify({
          results: [{ title: "Should not render", collection: "aapd", snippet: "x" }],
        }),
      }),
    );

    expect(queryByText("Should not render")).not.toBeInTheDocument();
  });

  it("handles a missing result string without crashing", () => {
    render(<Harness />);
    const renderSearchDocs = getSearchDocsRender();

    expect(() =>
      render(renderSearchDocs({ status: "complete", parameters: { query: "pulp therapy" } })),
    ).not.toThrow();
  });
});
