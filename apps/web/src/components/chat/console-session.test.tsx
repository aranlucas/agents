// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class MockHttpAgent {
    config: Record<string, unknown>;
    messages: unknown[] = [];
    state: unknown = {};

    constructor(config: Record<string, unknown>) {
      this.config = config;
    }

    setMessages(messages: unknown[]) {
      this.messages = messages;
    }

    setState(state: unknown) {
      this.state = state;
    }
  }

  return {
    MockHttpAgent,
    copilotProps: null as Record<string, unknown> | null,
    getToken: vi.fn(async () => "clerk-session-token"),
  };
});

vi.mock("@ag-ui/client", () => ({ HttpAgent: mocks.MockHttpAgent }));

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ getToken: mocks.getToken, isLoaded: true, sessionId: "session-123" }),
}));

vi.mock("@copilotkit/react-core/v2", () => ({
  CopilotKit: (props: Record<string, unknown> & { children: ReactNode }) => {
    mocks.copilotProps = props;
    return <>{props.children}</>;
  },
}));

vi.mock("@/env", () => ({
  env: { NEXT_PUBLIC_AGENTS_BASE_URL: "https://gateway.example" },
}));

vi.mock("@/components/chat/agents/registry", () => ({
  AGENT_ORDER: ["travel", "grocery"],
  AGENT_BACKEND_PATHS: { travel: "travel", grocery: "grocery" },
}));

vi.mock("@/lib/agent-url", () => ({ agentBaseUrl: (value: string) => value }));

import { ConsoleSession } from "./console-session";

describe("ConsoleSession direct AG-UI connection", () => {
  beforeEach(() => {
    mocks.copilotProps = null;
    mocks.getToken.mockClear();
  });

  it("loads Clerk headers and gives CopilotKit a self-managed Railway agent", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <ConsoleSession agent="travel" thread="thread-123">
          <span>Conversation ready</span>
        </ConsoleSession>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Conversation ready")).toBeInTheDocument();
    expect(mocks.getToken).toHaveBeenCalledOnce();

    await waitFor(() => expect(mocks.copilotProps).not.toBeNull());
    expect(mocks.copilotProps).not.toHaveProperty("runtimeUrl");
    const agents = mocks.copilotProps?.agents__unsafe_dev_only as Record<
      string,
      InstanceType<typeof mocks.MockHttpAgent>
    >;
    expect(Object.keys(agents)).toEqual(["travel", "grocery"]);
    expect(agents.travel.config).toMatchObject({
      agentId: "travel",
      url: "https://gateway.example/travel/agui",
      headers: { Authorization: "Bearer clerk-session-token" },
    });
    expect(agents.grocery.config).toMatchObject({
      agentId: "grocery",
      url: "https://gateway.example/grocery/agui",
      headers: { Authorization: "Bearer clerk-session-token" },
    });
    expect(agents.travel.config).not.toHaveProperty("threadId");
    expect(agents.grocery.config).not.toHaveProperty("threadId");
    expect(agents.travel.config).not.toHaveProperty("initialMessages");
    expect(agents.travel.config).not.toHaveProperty("initialState");
    expect(agents.grocery.config).not.toHaveProperty("initialMessages");
    expect(agents.grocery.config).not.toHaveProperty("initialState");
  });

  it("ignores expected abort errors but reports real CopilotKit failures", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <ConsoleSession agent="travel" thread="thread-123">
          <span>Conversation ready</span>
        </ConsoleSession>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Conversation ready")).toBeInTheDocument();
    const onError = mocks.copilotProps?.onError as (event: {
      error: Error;
      context: Record<string, unknown>;
    }) => void;
    const abortError = new Error("BodyStreamBuffer was aborted");
    abortError.name = "AbortError";

    onError({ error: abortError, context: {} });
    expect(consoleError).not.toHaveBeenCalled();

    const realError = new Error("connection failed");
    onError({ error: realError, context: { source: "network" } });
    expect(consoleError).toHaveBeenCalledWith(
      "[CopilotKit] Error:",
      realError,
      expect.objectContaining({ source: "network" }),
    );

    consoleError.mockRestore();
  });
});
