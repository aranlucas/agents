import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { focusManager } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestQueryClient, renderWithQueryClient } from "../render";
import { groceryQueryKeys } from "@/lib/query-keys";
import HouseholdsScreen from "@/app/households";

const mocks = vi.hoisted(() => ({
  auth: { getToken: vi.fn(), userId: "user_1" as string | null },
  api: {
    listHouseholds: vi.fn(),
    createHousehold: vi.fn(),
    joinHousehold: vi.fn(),
    createInvite: vi.fn(),
  },
  focus: null as null | (() => void | (() => void)),
  blur: null as null | (() => void),
  onRefresh: null as null | (() => void),
  push: vi.fn(),
}));

vi.mock("@clerk/clerk-expo", () => ({ useAuth: () => mocks.auth }));
vi.mock("@/lib/config", () => ({ getRuntimeUrl: () => "https://runtime.test" }));
vi.mock("@/lib/household-api", () => ({ createHouseholdApi: () => mocks.api }));
vi.mock("lucide-react-native", () => ({
  Check: () => null,
  Copy: () => null,
  Home: () => null,
  Users: () => null,
}));
vi.mock("@/components/ui/icon", () => ({ Icon: () => null }));
vi.mock("@/components/ui/badge", async () => {
  const React = await import("react");
  const { View } = await import("react-native");
  return { Badge: ({ children, ...props }: any) => React.createElement(View, props, children) };
});
vi.mock("@/components/ui/text", async () => {
  const React = await import("react");
  const { Text } = await import("react-native");
  return {
    Text: ({ children, ...props }: any) => React.createElement(Text, props, children),
    TextClassContext: React.createContext(""),
  };
});
vi.mock("@/components/ui/alert", async () => {
  const React = await import("react");
  const { Text } = await import("react-native");
  return {
    ErrorAlert: ({ message }: { message: string }) => React.createElement(Text, null, message),
  };
});
vi.mock("@/components/ui/refresh-control", async () => {
  const React = await import("react");
  const { View } = await import("react-native");
  return {
    RefreshControl: ({ onRefresh, ...props }: any) => {
      mocks.onRefresh = onRefresh;
      return React.createElement(View, props);
    },
  };
});
vi.mock("expo-router", async () => {
  const React = await import("react");
  return {
    useRouter: () => ({ push: mocks.push }),
    useFocusEffect: (effect: () => void | (() => void)) => {
      React.useEffect(() => {
        mocks.focus = effect;
        const cleanup = effect();
        mocks.blur = typeof cleanup === "function" ? cleanup : null;
        return () => mocks.blur?.();
      }, [effect]);
    },
  };
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

beforeEach(() => {
  mocks.auth.userId = "user_1";
  mocks.api.listHouseholds.mockReset().mockResolvedValue([]);
  mocks.api.createHousehold.mockReset();
  mocks.api.joinHousehold.mockReset();
  mocks.api.createInvite.mockReset();
  mocks.focus = null;
  mocks.blur = null;
  mocks.onRefresh = null;
  mocks.push.mockReset();
  focusManager.setFocused(true);
});

describe("HouseholdsScreen", () => {
  it("polls and refetches only while focused, including pull-to-refresh", async () => {
    vi.useFakeTimers();
    const client = createTestQueryClient();
    await renderWithQueryClient(<HouseholdsScreen />, client);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mocks.api.listHouseholds).toHaveBeenCalledOnce();
    expect(
      client.getQueryCache().find({ queryKey: groceryQueryKeys.households("user_1") })?.options,
    ).toMatchObject({
      enabled: true,
      refetchInterval: 30_000,
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(mocks.api.listHouseholds).toHaveBeenCalledTimes(2);

    await act(async () => mocks.blur?.());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
      focusManager.setFocused(false);
      focusManager.setFocused(true);
      await Promise.resolve();
    });
    expect(mocks.api.listHouseholds).toHaveBeenCalledTimes(2);

    await act(async () => {
      const cleanup = mocks.focus?.();
      mocks.blur = typeof cleanup === "function" ? cleanup : null;
      await Promise.resolve();
    });
    expect(mocks.api.listHouseholds).toHaveBeenCalledTimes(3);

    await act(async () => {
      mocks.onRefresh?.();
      await Promise.resolve();
    });
    expect(mocks.api.listHouseholds).toHaveBeenCalledTimes(4);
    vi.useRealTimers();
  });

  it("normalizes invite codes, prevents duplicates, invalidates the exact key, and clears on success", async () => {
    const joining = deferred<any>();
    mocks.api.joinHousehold.mockReturnValue(joining.promise);
    const client = createTestQueryClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    await renderWithQueryClient(<HouseholdsScreen />, client);
    await screen.findByText("No shared households yet");
    const input = screen.getByLabelText("Invite code");

    await act(async () => {
      fireEvent.changeText(input, "  abcd1234  ");
      await Promise.resolve();
    });
    await act(async () => {
      fireEvent(input, "submitEditing");
      fireEvent(input, "submitEditing");
      await Promise.resolve();
    });
    expect(mocks.api.joinHousehold).toHaveBeenCalledOnce();
    expect(mocks.api.joinHousehold.mock.calls[0]?.[0]).toBe("ABCD1234");
    expect(screen.getByLabelText("Invite code").props.value).toBe("  abcd1234  ");

    await act(async () => {
      joining.resolve({});
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.getByLabelText("Invite code").props.value).toBe(""));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: groceryQueryKeys.households("user_1") });
  });

  it("treats whitespace as a no-op and retains inputs when mutations fail", async () => {
    mocks.api.createHousehold.mockRejectedValue(new Error("Could not create household"));
    mocks.api.joinHousehold.mockRejectedValue(new Error("Could not join household"));
    await renderWithQueryClient(<HouseholdsScreen />);
    await screen.findByText("No shared households yet");
    const name = screen.getByLabelText("Household name");

    await act(async () => {
      fireEvent.changeText(name, "   ");
      await Promise.resolve();
    });
    await act(async () => fireEvent(name, "submitEditing"));
    expect(mocks.api.createHousehold).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.changeText(name, "  Roommates  ");
      await Promise.resolve();
    });
    await act(async () => fireEvent(name, "submitEditing"));
    await screen.findByText("Could not create household");
    expect(mocks.api.createHousehold.mock.calls[0]?.[0]).toBe("Roommates");
    expect(screen.getByLabelText("Household name").props.value).toBe("  Roommates  ");

    const invite = screen.getByLabelText("Invite code");
    await act(async () => {
      fireEvent.changeText(invite, "   ");
      await Promise.resolve();
    });
    await act(async () => fireEvent(invite, "submitEditing"));
    expect(mocks.api.joinHousehold).not.toHaveBeenCalled();
  });
});
