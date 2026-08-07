// @vitest-environment jsdom
import type { ReactElement } from "react";
import type { RenderToolProps } from "@copilotkit/react-core/v2/headless";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

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
  useInterrupt: vi.fn(() => null),
  useRenderTool: vi.fn(),
}));

vi.mock("@/lib/copilotkit/speak-question", () => ({
  speakQuestion: vi.fn().mockResolvedValue(undefined),
}));

import { useInterrupt, useRenderTool } from "@copilotkit/react-core/v2";
import { OralBoardsExtension } from "./oral-boards";

const searchDocsParameters = z.object({
  query: z.string(),
  collection: z.string().optional(),
});

type SearchDocsRenderArgs = RenderToolProps<typeof searchDocsParameters>;
type SearchDocsRenderer = (args: SearchDocsRenderArgs) => ReactElement;

const searchDocsToolCall = {
  name: "search_docs",
  toolCallId: "test-search-docs",
} as const;

function getSearchDocsRender(): SearchDocsRenderer {
  const call = vi
    .mocked(useRenderTool)
    .mock.calls.find(([config]) => (config as { name: string }).name === "search_docs");
  if (!call) throw new Error("search_docs was not registered via useRenderTool");
  return (call[0] as { render: SearchDocsRenderer }).render;
}

function CurrentQuestion() {
  const { currentQuestion } = useOralBoardsQuestion();
  return <output aria-label="Current question">{currentQuestion}</output>;
}

function PendingInputControls() {
  const { pendingInputKind, respondToPendingInput } = useOralBoardsQuestion();
  return (
    <div>
      <output aria-label="Pending input">{pendingInputKind ?? "none"}</output>
      <button type="button" onClick={() => respondToPendingInput("ready")}>
        Resolve pending input
      </button>
    </div>
  );
}

function Harness() {
  return (
    <OralBoardsQuestionProvider>
      <OralBoardsExtension agentId="oral-boards" />
      <CurrentQuestion />
    </OralBoardsQuestionProvider>
  );
}

function interruptConfig() {
  const config = vi.mocked(useInterrupt).mock.calls.at(-1)?.[0];
  if (!config) throw new Error("useInterrupt was not registered");
  return config;
}

describe("OralBoardsExtension", () => {
  beforeEach(() => {
    stableAgent.state = { current_question: "" };
  });

  it("mirrors current_question and retains it through the scoring transition", () => {
    const { rerender } = render(<Harness />);

    stableAgent.state = {
      current_question: "What is your immediate management plan?",
    };
    rerender(<Harness />);

    expect(screen.getByLabelText("Current question")).toHaveTextContent(
      "What is your immediate management plan?",
    );

    stableAgent.state = { current_question: "" };
    rerender(<Harness />);

    expect(screen.getByLabelText("Current question")).toHaveTextContent(
      "What is your immediate management plan?",
    );
  });

  it("registers and resolves a standard AG-UI RequestInput interrupt", async () => {
    render(<Harness />);
    const config = interruptConfig();
    const resolve = vi.fn(async () => undefined);
    const cancel = vi.fn(async () => undefined);
    const interrupt = {
      id: "oralboards-ready-run-1",
      reason: "tool_call",
      message: "Start the examination.",
      toolCallId: "oralboards-ready-run-1",
      metadata: {
        payload: { kind: "ready", question: "Ready to begin?" },
      },
    };

    render(
      <OralBoardsQuestionProvider>
        {config.render({
          event: { name: "on_interrupt", value: interrupt },
          interrupt,
          interrupts: [interrupt],
          result: null,
          resolve,
          cancel,
        })}
        <PendingInputControls />
      </OralBoardsQuestionProvider>,
    );

    expect(screen.getByLabelText("Pending input")).toHaveTextContent("ready");
    await userEvent.click(screen.getAllByRole("button", { name: "Resolve pending input" }).at(-1)!);
    expect(resolve).toHaveBeenCalledWith({ answer: "ready" }, "oralboards-ready-run-1");
  });

  it("keeps answer interrupts headless so they cannot cover the exam workspace", () => {
    render(<Harness />);
    const config = interruptConfig();
    const interrupt = {
      id: "oralboards-answer-0-run-1",
      reason: "tool_call" as const,
      message: "What is your diagnosis?",
      toolCallId: "oralboards-answer-0-run-1",
      metadata: {
        payload: { kind: "answer", question: "What is your diagnosis?" },
      },
    };

    render(
      <OralBoardsQuestionProvider>
        {config.render({
          event: { name: "on_interrupt", value: interrupt },
          interrupt,
          interrupts: [interrupt],
          result: null,
          resolve: vi.fn(async () => undefined),
          cancel: vi.fn(async () => undefined),
        })}
        <PendingInputControls />
      </OralBoardsQuestionProvider>,
    );

    expect(screen.getByLabelText("Pending input")).toHaveTextContent("answer");
    expect(screen.queryByText("ask_question")).not.toBeInTheDocument();
    expect(screen.queryByText("What is your diagnosis?")).not.toBeInTheDocument();
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
        ...searchDocsToolCall,
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
          ...searchDocsToolCall,
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
        ...searchDocsToolCall,
        status: "inProgress",
        parameters: { query: "pulp therapy" },
        result: undefined,
      }),
    );

    expect(queryByText("Should not render")).not.toBeInTheDocument();
  });

  it("handles an executing call without a result string", () => {
    render(<Harness />);
    const renderSearchDocs = getSearchDocsRender();

    expect(() =>
      render(
        renderSearchDocs({
          ...searchDocsToolCall,
          status: "executing",
          parameters: { query: "pulp therapy" },
          result: undefined,
        }),
      ),
    ).not.toThrow();
  });
});
