// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  return {
    copilotProps: null as Record<string, unknown> | null,
    getToken: vi.fn<() => Promise<string | null>>(async () => "clerk-session-token"),
    isLoaded: true,
    useThreads: vi.fn(() => ({ threads: [] })),
  };
});

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({
    getToken: mocks.getToken,
    isLoaded: mocks.isLoaded,
    sessionId: "session-123",
    userId: "user-123",
  }),
}));

vi.mock("@copilotkit/react-core/v2", () => ({
  CopilotKit: (props: Record<string, unknown> & { children: ReactNode }) => {
    mocks.copilotProps = props;
    return <>{props.children}</>;
  },
  useThreads: mocks.useThreads,
}));

vi.mock("@/env", () => ({
  env: { NEXT_PUBLIC_AGENTS_BASE_URL: "https://gateway.example" },
}));

vi.mock("@/lib/agent-url", () => ({ agentBaseUrl: (value: string) => value }));

import { ConsoleSession } from "./console-session";

describe("ConsoleSession gateway runtime connection", () => {
  beforeEach(() => {
    mocks.copilotProps = null;
    mocks.getToken.mockClear();
    mocks.getToken.mockResolvedValue("clerk-session-token");
    mocks.useThreads.mockClear();
    mocks.isLoaded = true;
  });

  it("renders a custom loading state while Clerk is loading", () => {
    mocks.isLoaded = false;
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <ConsoleSession agent="travel" loading={<span>Introduction skeleton</span>}>
          <span>Conversation ready</span>
        </ConsoleSession>
      </QueryClientProvider>,
    );

    expect(screen.getByText("Introduction skeleton")).toBeVisible();
    expect(screen.queryByText("Conversation ready")).not.toBeInTheDocument();
  });

  it("loads Clerk headers and configures chat plus stateless suggestions", async () => {
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
    expect(mocks.copilotProps).toMatchObject({
      agent: "travel",
      runtimeUrl: "https://gateway.example",
      headers: { Authorization: "Bearer clerk-session-token" },
      useSingleEndpoint: false,
      enableInspector: false,
      threadId: "thread-123",
    });
    expect(mocks.useThreads).toHaveBeenCalledOnce();
    expect(mocks.useThreads).toHaveBeenCalledWith({ agentId: "travel", enabled: true });
  });

  it("does not load protected thread history without a Clerk token", async () => {
    mocks.getToken.mockResolvedValue(null);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <ConsoleSession agent="resume" thread="public-thread">
          <span>Public conversation ready</span>
        </ConsoleSession>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Public conversation ready")).toBeInTheDocument();
    expect(mocks.useThreads).toHaveBeenCalledOnce();
    expect(mocks.useThreads).toHaveBeenCalledWith({ agentId: "resume", enabled: false });
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
