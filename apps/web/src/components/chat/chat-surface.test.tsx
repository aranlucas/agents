// @vitest-environment jsdom
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const copilotMocks = vi.hoisted(() => {
  const connectAgent = vi.fn(async (_options: { agent: { threadId?: string } }) => undefined);
  const runAgent = vi.fn(async () => undefined);
  const stopAgent = vi.fn();
  const runtime: { connectionStatus: string; url: string | undefined } = {
    connectionStatus: "connected",
    url: "/api/copilotkit",
  };
  const copilotkit = {
    connectAgent,
    runAgent,
    stopAgent,
    get runtimeConnectionStatus() {
      return runtime.connectionStatus;
    },
    get runtimeUrl() {
      return runtime.url;
    },
  };

  return {
    agent: {
      addMessage: vi.fn(),
      abortController: undefined as AbortController | undefined,
      isRunning: false,
      messages: [] as unknown[],
      setMessages: vi.fn(),
      state: {},
      threadId: undefined as string | undefined,
    },
    connectAgent,
    copilotkit,
    runAgent,
    stopAgent,
    suggestions: [] as Array<{ title: string; message: string; isLoading: boolean }>,
    get runtimeConnectionStatus() {
      return runtime.connectionStatus;
    },
    set runtimeConnectionStatus(value: string) {
      runtime.connectionStatus = value;
    },
    get runtimeUrl() {
      return runtime.url;
    },
    set runtimeUrl(value: string | undefined) {
      runtime.url = value;
    },
  };
});

const messageScrollerMocks = vi.hoisted(() => ({
  scrollToMessage: vi.fn(() => true),
}));

vi.mock("@copilotkit/react-core/v2", () => ({
  UseAgentUpdate: {
    OnMessagesChanged: "OnMessagesChanged",
    OnRunStatusChanged: "OnRunStatusChanged",
    OnStateChanged: "OnStateChanged",
  },
  useAgent: () => ({ agent: copilotMocks.agent }),
  useCopilotKit: () => ({ copilotkit: copilotMocks.copilotkit }),
  useDefaultRenderTool: vi.fn(),
  useRenderActivityMessage: () => ({
    renderActivityMessage: (message: { id: string }) => (
      <div data-testid="activity-surface">{message.id}</div>
    ),
  }),
  useRenderToolCall: () => () => null,
  useSuggestions: () => ({ suggestions: copilotMocks.suggestions }),
}));

vi.mock("lucide-react", () => ({
  SparklesIcon: () => <span data-testid="sparkles" />,
  PaperclipIcon: () => <span data-testid="paperclip" />,
  FileIcon: () => <span data-testid="file" />,
  XIcon: () => <span data-testid="x" />,
}));

vi.mock("@agents/ui", () => ({
  Button: ({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
  Streamdown: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@agents/ui/components/message-scroller", () => ({
  MessageScrollerProvider: ({
    children,
    scrollPreviousItemPeek,
  }: {
    children: ReactNode;
    scrollPreviousItemPeek?: number;
  }) => (
    <div data-testid="message-scroller" data-previous-item-peek={scrollPreviousItemPeek}>
      {children}
    </div>
  ),
  MessageScroller: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  MessageScrollerViewport: ({ children, ...props }: HTMLAttributes<HTMLDivElement>) => (
    <div data-testid="message-scroller-viewport" {...props}>
      {children}
    </div>
  ),
  MessageScrollerContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  MessageScrollerItem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  MessageScrollerButton: () => null,
  useMessageScroller: () => ({ scrollToMessage: messageScrollerMocks.scrollToMessage }),
}));

vi.mock("@agents/ui/components/message", () => ({
  Message: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  MessageContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@agents/ui/components/bubble", () => ({
  Bubble: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  BubbleContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@agents/ui/components/empty", () => ({
  Empty: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  EmptyMedia: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  EmptyHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  EmptyTitle: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  EmptyDescription: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@agents/ui/components/ai-elements/prompt-input", () => ({
  PromptInput: ({
    children,
    onSubmit,
    onSubmitCapture,
  }: {
    children: ReactNode;
    onSubmit: (message: { text: string; files: [] }) => void;
    onSubmitCapture?: () => void;
  }) => (
    <form
      data-testid="prompt-input"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmitCapture?.();
        onSubmit({ text: "Animate this message", files: [] });
      }}
    >
      {children}
    </form>
  ),
  PromptInputBody: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PromptInputFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PromptInputHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PromptInputProvider: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PromptInputSubmit: () => <button type="button">submit</button>,
  PromptInputTextarea: () => <textarea />,
  PromptInputTools: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PromptInputActionMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PromptInputActionMenuTrigger: ({ children }: { children: ReactNode }) => (
    <button type="button">{children}</button>
  ),
  PromptInputActionMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PromptInputActionAddAttachments: () => <button type="button">attach</button>,
  usePromptInputAttachments: () => ({ files: [], remove: vi.fn() }),
}));

vi.mock("@agents/ui/components/ai-elements/reasoning", () => ({
  Reasoning: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ReasoningContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ReasoningTrigger: () => <button type="button">reasoning</button>,
}));

vi.mock("@agents/ui/components/ai-elements/suggestion", () => ({
  Suggestion: ({ suggestion }: { suggestion: string }) => (
    <button type="button">{suggestion}</button>
  ),
  Suggestions: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@agents/ui/components/ai-elements/tool", () => ({
  Tool: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ToolContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ToolHeader: () => <div />,
  ToolInput: () => <div />,
  ToolOutput: () => <div />,
}));

vi.mock("@/hooks/use-required-connections", () => ({
  useRequiredConnections: () => ({ isLoading: false, isMissing: false }),
}));

vi.mock("./agent-selector", () => ({
  AgentSelector: () => <button type="button">agent</button>,
}));

vi.mock("./connect-notice", () => ({
  ConnectNotice: () => <div />,
}));

vi.mock("./transcribe-button", () => ({
  TranscribeButton: () => <button type="button">transcribe</button>,
}));

import { ChatSurface, getRunCompletionPromise } from "./chat-surface";
import { getAgentConfig } from "./agents/registry";

describe("getRunCompletionPromise", () => {
  it("reads a run-completion promise without narrowing the agent type", async () => {
    const completion = Promise.resolve();

    expect(getRunCompletionPromise({ activeRunCompletionPromise: completion })).toBe(completion);
    expect(
      getRunCompletionPromise({ activeRunCompletionPromise: "not a promise" }),
    ).toBeUndefined();
    expect(getRunCompletionPromise(null)).toBeUndefined();
  });
});

describe("ChatSurface history replay", () => {
  beforeEach(() => {
    copilotMocks.agent.addMessage.mockReset();
    copilotMocks.connectAgent.mockClear();
    messageScrollerMocks.scrollToMessage.mockClear();
    copilotMocks.runtimeConnectionStatus = "connected";
    copilotMocks.runtimeUrl = "/api/copilotkit";
    copilotMocks.agent.abortController = undefined;
    copilotMocks.agent.threadId = undefined;
    copilotMocks.agent.messages = [];
    copilotMocks.suggestions = [];
  });

  it("binds the route thread and connects the agent so reloads replay thread history", async () => {
    copilotMocks.connectAgent.mockImplementationOnce(async ({ agent }) => {
      expect(agent.threadId).toBe("thread-123");
    });

    render(
      <ChatSurface
        config={getAgentConfig("travel")}
        threadId="thread-123"
        onSwitchAgent={() => {}}
        onOpenArtifact={() => {}}
      />,
    );

    await waitFor(() => {
      expect(copilotMocks.connectAgent).toHaveBeenCalledWith({ agent: copilotMocks.agent });
    });
    expect(copilotMocks.agent.threadId).toBe("thread-123");
    expect(copilotMocks.agent.abortController).toBeInstanceOf(AbortController);
  });

  it("waits until the runtime connection is ready before replaying history", () => {
    copilotMocks.runtimeConnectionStatus = "connecting";

    render(
      <ChatSurface
        config={getAgentConfig("travel")}
        threadId="thread-123"
        onSwitchAgent={() => {}}
        onOpenArtifact={() => {}}
      />,
    );

    expect(copilotMocks.connectAgent).not.toHaveBeenCalled();
  });

  it("does not connect without a ready CopilotKit runtime", () => {
    copilotMocks.runtimeConnectionStatus = "disconnected";
    copilotMocks.runtimeUrl = undefined;

    render(
      <ChatSurface
        config={getAgentConfig("travel")}
        threadId="thread-123"
        onSwitchAgent={() => {}}
        onOpenArtifact={() => {}}
      />,
    );

    expect(copilotMocks.connectAgent).not.toHaveBeenCalled();
  });

  it("renders generic activity messages through CopilotKit's resolver", () => {
    copilotMocks.agent.messages = [
      {
        id: "surface-1",
        role: "activity",
        activityType: "progress",
        content: {
          status: "running",
        },
      },
    ];

    const { getByTestId } = render(
      <ChatSurface
        config={getAgentConfig("trends")}
        threadId="thread-123"
        onSwitchAgent={() => {}}
        onOpenArtifact={() => {}}
      />,
    );

    expect(getByTestId("activity-surface")).toHaveTextContent("surface-1");
  });

  it("renders assistant text without a decorative agent icon", () => {
    copilotMocks.agent.messages = [
      {
        id: "assistant-1",
        role: "assistant",
        content: "Assistant answer",
      },
    ];

    const { getByText, queryByTestId } = render(
      <ChatSurface
        config={getAgentConfig("resume")}
        threadId="thread-123"
        onSwitchAgent={() => {}}
        onOpenArtifact={() => {}}
      />,
    );

    expect(getByText("Assistant answer")).toBeInTheDocument();
    expect(queryByTestId("sparkles")).not.toBeInTheDocument();
  });

  it("smoothly anchors a submitted user message at the top of the viewport", async () => {
    copilotMocks.agent.addMessage.mockImplementationOnce((message: unknown) => {
      copilotMocks.agent.messages = [...copilotMocks.agent.messages, message];
    });
    const { getByRole, getByTestId, getByText } = render(
      <ChatSurface
        config={getAgentConfig("resume")}
        threadId="thread-123"
        onSwitchAgent={() => {}}
        onOpenArtifact={() => {}}
      />,
    );

    await waitFor(() => {
      expect(getByText("Resume is ready")).toBeInTheDocument();
    });

    const composer = getByRole("textbox");
    composer.focus();
    expect(composer).toHaveFocus();

    fireEvent.submit(getByTestId("prompt-input"));

    expect(composer).not.toHaveFocus();
    expect(copilotMocks.agent.addMessage).toHaveBeenCalledWith(
      expect.objectContaining({ role: "user", content: "Animate this message" }),
    );
    expect(getByTestId("message-scroller")).toHaveAttribute("data-previous-item-peek", "0");
    await waitFor(() => {
      expect(messageScrollerMocks.scrollToMessage).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ align: "start", behavior: "smooth", scrollMargin: 0 }),
      );
    });
  });

  it("gives duplicate suggestion titles unique React keys", async () => {
    copilotMocks.suggestions = [
      {
        title: "Create a weekly meal plan",
        message: "Create a weekly meal plan for two people.",
        isLoading: false,
      },
      {
        title: "Create a weekly meal plan",
        message: "Create a vegetarian weekly meal plan.",
        isLoading: false,
      },
      {
        title: "Create a weekly meal plan",
        message: "Create a vegetarian weekly meal plan.",
        isLoading: false,
      },
    ];
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      const { getAllByRole } = render(
        <ChatSurface
          config={getAgentConfig("grocery")}
          threadId="thread-123"
          onSwitchAgent={() => {}}
          onOpenArtifact={() => {}}
        />,
      );

      await waitFor(() => {
        expect(getAllByRole("button", { name: "Create a weekly meal plan" })).toHaveLength(2);
      });
      expect(consoleError.mock.calls.flat().join(" ")).not.toContain(
        "Encountered two children with the same key",
      );
    } finally {
      consoleError.mockRestore();
    }
  });
});
