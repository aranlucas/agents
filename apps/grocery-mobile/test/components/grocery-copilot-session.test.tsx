import { screen, userEvent } from "@testing-library/react-native";
import { focusManager, onlineManager } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Text } from "react-native";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestQueryClient, renderWithQueryClient } from "../render";
import { groceryQueryKeys } from "@/lib/query-keys";
import { GroceryCopilotSession } from "@/components/grocery-copilot-session";

const mocks = vi.hoisted(() => ({
  auth: {
    getToken: vi.fn<() => Promise<string | null>>(),
    isLoaded: true,
    userId: "user_1" as string | null,
  },
  providerProps: [] as Array<{
    headers: Record<string, string>;
    onError?: (event: {
      error: Error;
      code: string;
      context: Record<string, unknown>;
    }) => void | Promise<void>;
    runtimeUrl: string;
  }>,
}));

vi.mock("@clerk/clerk-expo", () => ({ useAuth: () => mocks.auth }));
vi.mock("@copilotkit/react-native", () => ({
  CopilotKitProvider: (props: {
    children: ReactNode;
    headers: Record<string, string>;
    onError?: (event: {
      error: Error;
      code: string;
      context: Record<string, unknown>;
    }) => void | Promise<void>;
    runtimeUrl: string;
  }) => {
    mocks.providerProps.push(props);
    return props.children;
  },
}));
vi.mock("@/components/grocery-agent-provider", () => ({
  GroceryAgentProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/components/ui/alert", async () => {
  const React = await import("react");
  const { Text: NativeText } = await import("react-native");
  return {
    Alert: ({ title }: { title: string }) => React.createElement(NativeText, null, title),
  };
});
vi.mock("@/components/ui/button", async () => {
  const React = await import("react");
  const { Pressable, Text: NativeText } = await import("react-native");
  return {
    Button: ({ children, onPress }: { children: ReactNode; onPress?: () => void }) =>
      React.createElement(
        Pressable,
        { accessibilityRole: "button", onPress },
        React.createElement(NativeText, null, children),
      ),
  };
});
vi.mock("@/components/ui/spinner", () => ({ Spinner: () => null }));
vi.mock("@/components/ui/text", async () => {
  const React = await import("react");
  const { Text: NativeText } = await import("react-native");
  return {
    Text: ({ children, ...props }: { children: ReactNode }) =>
      React.createElement(NativeText, props, children),
  };
});

beforeEach(() => {
  mocks.auth.getToken.mockReset();
  mocks.auth.isLoaded = true;
  mocks.auth.userId = "user_1";
  mocks.providerProps.length = 0;
  focusManager.setFocused(true);
  onlineManager.setOnline(true);
});

afterEach(() => {
  vi.useRealTimers();
  focusManager.setFocused(true);
  onlineManager.setOnline(true);
});

describe("GroceryCopilotSession", () => {
  it("loads a Clerk token with the canonical zero-GC non-retrying query", async () => {
    mocks.auth.getToken.mockResolvedValue("token_1");
    const client = createTestQueryClient();

    await renderWithQueryClient(
      <GroceryCopilotSession runtimeUrl="https://runtime.test">
        <Text>Session ready</Text>
      </GroceryCopilotSession>,
      client,
    );

    expect(screen.getByLabelText("Loading Grocery Agent")).toBeTruthy();
    await screen.findByText("Session ready");
    expect(mocks.auth.getToken).toHaveBeenCalledOnce();
    expect(mocks.providerProps.at(-1)).toMatchObject({
      runtimeUrl: "https://runtime.test",
      headers: { Authorization: "Bearer token_1", "x-clerk-user-id": "user_1" },
    });
    expect(
      client.getQueryCache().find({ queryKey: groceryQueryKeys.copilotSession("user_1") })?.options,
    ).toMatchObject({
      retry: false,
      staleTime: 20_000,
      refetchInterval: 30_000,
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      gcTime: 0,
    });
  });

  it("silences expected run cancellations without hiding real CopilotKit errors", async () => {
    mocks.auth.getToken.mockResolvedValue("token_1");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await renderWithQueryClient(
      <GroceryCopilotSession runtimeUrl="https://runtime.test">
        <Text>Session ready</Text>
      </GroceryCopilotSession>,
    );
    await screen.findByText("Session ready");
    const onError = mocks.providerProps.at(-1)?.onError;
    expect(onError).toBeTypeOf("function");

    await onError?.({
      code: "agent_run_error_event",
      context: { event: { code: "canceled" } },
      error: new Error("the agent run was canceled"),
    });
    expect(consoleError).not.toHaveBeenCalled();

    const error = new Error("runtime unavailable");
    await onError?.({ code: "agent_run_failed", context: { agentId: "grocery" }, error });
    expect(consoleError).toHaveBeenCalledWith("[CopilotKit] Error (agent_run_failed):", error, {
      agentId: "grocery",
    });
    consoleError.mockRestore();
  });

  it("keeps last-good headers when a recoverable refresh fails", async () => {
    mocks.auth.getToken
      .mockResolvedValueOnce("token_1")
      .mockRejectedValueOnce(new Error("offline"));
    const client = createTestQueryClient();

    await renderWithQueryClient(
      <GroceryCopilotSession runtimeUrl="https://runtime.test">
        <Text>Session ready</Text>
      </GroceryCopilotSession>,
      client,
    );
    await screen.findByText("Session ready");

    await client.refetchQueries({ queryKey: groceryQueryKeys.copilotSession("user_1") });

    expect(mocks.auth.getToken).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Session ready")).toBeTruthy();
    expect(mocks.providerProps.at(-1)?.headers).toEqual({
      Authorization: "Bearer token_1",
      "x-clerk-user-id": "user_1",
    });
  });

  it("offers manual recovery when no token has ever been cached", async () => {
    mocks.auth.getToken
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce("token_2");

    await renderWithQueryClient(
      <GroceryCopilotSession runtimeUrl="https://runtime.test">
        <Text>Session ready</Text>
      </GroceryCopilotSession>,
    );

    await screen.findByText("offline");
    expect(mocks.auth.getToken).toHaveBeenCalledOnce();
    const user = userEvent.setup();
    await user.press(screen.getByRole("button", { name: "Try again" }));

    await screen.findByText("Session ready");
    expect(mocks.auth.getToken).toHaveBeenCalledTimes(2);
    expect(mocks.providerProps.at(-1)?.headers.Authorization).toBe("Bearer token_2");
  });

  it("refreshes on the 30-second foreground interval but pauses it in the background", async () => {
    vi.useFakeTimers();
    mocks.auth.getToken.mockResolvedValue("token_1");

    await renderWithQueryClient(
      <GroceryCopilotSession runtimeUrl="https://runtime.test">
        <Text>Session ready</Text>
      </GroceryCopilotSession>,
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(mocks.auth.getToken).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(30_000);
    expect(mocks.auth.getToken).toHaveBeenCalledTimes(2);

    focusManager.setFocused(false);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(mocks.auth.getToken).toHaveBeenCalledTimes(2);

    focusManager.setFocused(true);
    await Promise.resolve();
    expect(mocks.auth.getToken).toHaveBeenCalledTimes(3);

    await vi.advanceTimersByTimeAsync(30_000);
    expect(mocks.auth.getToken).toHaveBeenCalledTimes(4);
  });
});
