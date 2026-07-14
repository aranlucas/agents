// @vitest-environment jsdom
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const copilotMocks = vi.hoisted(() => ({
  agent: {
    addMessage: vi.fn(),
    abortController: undefined as AbortController | undefined,
    isRunning: false,
    messages: [] as unknown[],
    setMessages: vi.fn(),
    state: {},
    threadId: undefined as string | undefined,
  },
  connectAgent: vi.fn(async (_options: { agent: { threadId?: string } }) => undefined),
  runAgent: vi.fn(async () => undefined),
  stopAgent: vi.fn(),
  runtimeConnectionStatus: "connected",
  // Widen the mutable mock so the disconnected test can assign undefined.
  // oxlint-disable-next-line typescript/no-unnecessary-type-assertion
  runtimeUrl: "/api/offline-copilotkit" as string | undefined,
}));

vi.mock("@copilotkit/react-core/v2", () => ({
  UseAgentUpdate: {
    OnMessagesChanged: "OnMessagesChanged",
    OnRunStatusChanged: "OnRunStatusChanged",
    OnStateChanged: "OnStateChanged",
  },
  useAgent: () => ({ agent: copilotMocks.agent }),
  useCopilotKit: () => ({
    copilotkit: {
      connectAgent: copilotMocks.connectAgent,
      runAgent: copilotMocks.runAgent,
      runtimeConnectionStatus: copilotMocks.runtimeConnectionStatus,
      runtimeUrl: copilotMocks.runtimeUrl,
      stopAgent: copilotMocks.stopAgent,
    },
  }),
  useDefaultRenderTool: vi.fn(),
  useRenderActivityMessage: () => ({
    renderActivityMessage: (message: { id: string }) => (
      <div data-testid="activity-surface">{message.id}</div>
    ),
  }),
  useRenderToolCall: () => () => null,
  useSuggestions: () => ({ suggestions: [] }),
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
  MessageScrollerProvider: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  MessageScroller: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  MessageScrollerViewport: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  MessageScrollerContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  MessageScrollerItem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  MessageScrollerButton: () => null,
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
  PromptInput: ({ children }: { children: ReactNode }) => <form>{children}</form>,
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
    copilotMocks.connectAgent.mockClear();
    copilotMocks.runtimeConnectionStatus = "connected";
    copilotMocks.runtimeUrl = "/api/offline-copilotkit";
    copilotMocks.agent.abortController = undefined;
    copilotMocks.agent.threadId = undefined;
    copilotMocks.agent.messages = [];
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

  it("connects a self-managed agent without a CopilotRuntime", async () => {
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

    await waitFor(() => {
      expect(copilotMocks.connectAgent).toHaveBeenCalledWith({ agent: copilotMocks.agent });
    });
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
});
