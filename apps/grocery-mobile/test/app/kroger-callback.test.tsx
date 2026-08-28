import { screen, userEvent, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestQueryClient, renderWithQueryClient } from "../render";
import { groceryQueryKeys } from "@/lib/query-keys";
import KrogerCallbackScreen from "@/app/kroger-callback";

const mocks = vi.hoisted(() => ({
  clerk: { isLoaded: true, user: null as any },
  replace: vi.fn(),
  waitForKrogerConnection: vi.fn(),
}));

vi.mock("@clerk/expo", () => ({ useUser: () => mocks.clerk }));
vi.mock("expo-router", () => ({ useRouter: () => ({ replace: mocks.replace }) }));
vi.mock("@/lib/connections", () => ({
  waitForKrogerConnection: mocks.waitForKrogerConnection,
}));
vi.mock("@/components/ui/spinner", () => ({ Spinner: () => null }));
vi.mock("@/components/ui/text", async () => {
  const React = await import("react");
  const { Text } = await import("react-native");
  return {
    Text: ({ children, ...props }: { children: ReactNode }) =>
      React.createElement(Text, props, children),
  };
});
vi.mock("@/components/ui/button", async () => {
  const React = await import("react");
  const { Pressable, Text } = await import("react-native");
  return {
    Button: ({ children, onPress }: { children: ReactNode; onPress?: () => void }) =>
      React.createElement(
        Pressable,
        { accessibilityRole: "button", onPress },
        React.createElement(Text, null, children),
      ),
  };
});

beforeEach(() => {
  mocks.replace.mockReset();
  mocks.waitForKrogerConnection.mockReset();
  mocks.clerk.isLoaded = true;
  mocks.clerk.user = {
    id: "user_1",
    reload: vi.fn(),
    externalAccounts: [],
  };
});

afterEach(() => vi.useRealTimers());

describe("KrogerCallbackScreen", () => {
  it("writes the verified user to the connection cache before returning to the dashboard", async () => {
    const verifiedUser = {
      ...mocks.clerk.user,
      externalAccounts: [
        { provider: "oauth_custom_shopping", verification: { status: "verified" } },
      ],
    };
    mocks.waitForKrogerConnection.mockResolvedValue(verifiedUser);
    const client = createTestQueryClient();
    const setQueryData = vi.spyOn(client, "setQueryData");

    await renderWithQueryClient(<KrogerCallbackScreen />, client);

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/"));
    expect(mocks.waitForKrogerConnection).toHaveBeenCalledWith({
      reload: expect.any(Function),
      signal: expect.any(AbortSignal),
    });
    expect(setQueryData).toHaveBeenCalledWith(
      groceryQueryKeys.krogerConnection("user_1"),
      verifiedUser,
    );
    expect(setQueryData.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.replace.mock.invocationCallOrder[0]!,
    );
  });

  it("uses a zero-GC callback query so remounting performs a fresh verification", async () => {
    mocks.waitForKrogerConnection.mockResolvedValue(mocks.clerk.user);
    const client = createTestQueryClient();
    const first = await renderWithQueryClient(<KrogerCallbackScreen />, client);
    await waitFor(() => expect(mocks.waitForKrogerConnection).toHaveBeenCalledOnce());

    await first.unmount();
    await waitFor(() =>
      expect(client.getQueryData(groceryQueryKeys.krogerCallback("user_1"))).toBeUndefined(),
    );

    await renderWithQueryClient(<KrogerCallbackScreen />, client);
    await waitFor(() => expect(mocks.waitForKrogerConnection).toHaveBeenCalledTimes(2));
  });

  it("shows a polling failure and routes the recovery action to the dashboard", async () => {
    mocks.waitForKrogerConnection.mockRejectedValue(new Error("Kroger reload failed"));

    await renderWithQueryClient(<KrogerCallbackScreen />);

    await screen.findByText("Kroger reload failed");
    const user = userEvent.setup();
    await user.press(screen.getByRole("button", { name: "Back to Grocery Agent" }));
    expect(mocks.replace).toHaveBeenCalledWith("/");
  });

  it("shows an expired-session recovery instead of waiting forever", async () => {
    mocks.clerk.user = null;

    await renderWithQueryClient(<KrogerCallbackScreen />);

    expect(await screen.findByText("Your session has expired. Please sign in again.")).toBeTruthy();
    expect(mocks.waitForKrogerConnection).not.toHaveBeenCalled();
  });
});
