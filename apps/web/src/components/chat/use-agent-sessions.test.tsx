// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getToken: vi.fn(async () => "clerk-session-jwt"),
}));

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ getToken: mocks.getToken, isLoaded: true, userId: "user-123" }),
}));

vi.mock("@/components/chat/agents/registry", () => ({
  AGENT_BACKEND_PATHS: { travel: "travel" },
}));

vi.mock("@/env", () => ({
  env: { NEXT_PUBLIC_AGENTS_BASE_URL: "https://gateway.example" },
}));

vi.mock("@/lib/agent-url", () => ({ agentBaseUrl: (value: string) => value }));

import { useAgentSessions } from "./use-agent-sessions";

describe("useAgentSessions", () => {
  beforeEach(() => {
    mocks.getToken.mockClear();
  });

  it("lists the active Clerk user's agent sessions with a current JWT", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> =>
        new Response(
          JSON.stringify([{ id: "thread-1", name: "Plan Japan", lastUpdateTime: 1_783_900_000 }]),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useAgentSessions("travel"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mocks.getToken).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("https://gateway.example/travel/agents/sessions");
    expect(init).toMatchObject({ headers: { Authorization: "Bearer clerk-session-jwt" } });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(result.current.data).toEqual([
      { id: "thread-1", name: "Plan Japan", lastUpdateTime: 1_783_900_000 },
    ]);
  });
});
