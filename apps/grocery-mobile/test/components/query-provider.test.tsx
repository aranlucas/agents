import * as React from "react";
import NetInfo from "@react-native-community/netinfo";
import { render } from "@testing-library/react-native";
import { focusManager, onlineManager, useQueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppState, Text, type AppStateStatus } from "react-native";
import { createGroceryQueryClient, QueryProvider } from "@/components/query-provider";

function QueryClientIdentity({ onClient }: { onClient(client: object): void }) {
  const client = useQueryClient();
  React.useEffect(() => {
    onClient(client);
  }, [client, onClient]);
  return <Text>Ready</Text>;
}

afterEach(() => {
  focusManager.setFocused(true);
  onlineManager.setOnline(true);
});

describe("createGroceryQueryClient", () => {
  it("uses mobile-safe query and mutation defaults", () => {
    const client = createGroceryQueryClient();

    expect(client.getDefaultOptions().queries).toMatchObject({
      retry: 2,
      networkMode: "online",
      refetchOnReconnect: true,
      refetchOnWindowFocus: true,
    });
    expect(client.getDefaultOptions().mutations).toMatchObject({
      retry: false,
      networkMode: "online",
    });
  });
});

describe("QueryProvider", () => {
  it("keeps one client and bridges native focus and connectivity", async () => {
    let appStateListener: ((status: AppStateStatus) => void) | undefined;
    let networkListener: Parameters<typeof NetInfo.addEventListener>[0] | undefined;
    const removeAppState = vi.fn();
    const removeNetwork = vi.fn();
    const clients: object[] = [];

    vi.spyOn(AppState, "addEventListener").mockImplementation((_event, listener) => {
      appStateListener = listener;
      return { remove: removeAppState };
    });
    vi.spyOn(NetInfo, "addEventListener").mockImplementation((listener) => {
      networkListener = listener;
      return removeNetwork;
    });
    Object.defineProperty(AppState, "currentState", {
      configurable: true,
      value: "background",
    });

    const screen = await render(
      <QueryProvider>
        <QueryClientIdentity onClient={(client) => clients.push(client)} />
      </QueryProvider>,
    );

    expect(focusManager.isFocused()).toBe(false);
    expect(clients.length).toBeGreaterThan(0);
    expect(new Set(clients).size).toBe(1);

    appStateListener?.("active");
    expect(focusManager.isFocused()).toBe(true);
    appStateListener?.("inactive");
    expect(focusManager.isFocused()).toBe(false);
    appStateListener?.("background");
    expect(focusManager.isFocused()).toBe(false);

    networkListener?.({ isConnected: false, isInternetReachable: null } as never);
    expect(onlineManager.isOnline()).toBe(false);
    networkListener?.({ isConnected: true, isInternetReachable: false } as never);
    expect(onlineManager.isOnline()).toBe(false);
    networkListener?.({ isConnected: true, isInternetReachable: null } as never);
    expect(onlineManager.isOnline()).toBe(true);
    networkListener?.({ isConnected: true, isInternetReachable: true } as never);
    expect(onlineManager.isOnline()).toBe(true);

    await screen.unmount();
    expect(removeAppState).toHaveBeenCalledOnce();
    expect(removeNetwork).toHaveBeenCalledOnce();
  });
});
