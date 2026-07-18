import { screen, userEvent, waitFor } from "@testing-library/react-native";
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
  const { Text } = await import("react-native");
  return { Badge: ({ children, ...props }: any) => React.createElement(Text, props, children) };
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
    Alert: ({ title }: { title: string }) => React.createElement(Text, null, title),
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
  it("refetches when focused and on pull-to-refresh without polling", async () => {
    const client = createTestQueryClient();
    await renderWithQueryClient(<HouseholdsScreen />, client);
    await waitFor(() => expect(mocks.api.listHouseholds).toHaveBeenCalledOnce());
    const getQueryOptions = () =>
      client.getQueryCache().find({ queryKey: groceryQueryKeys.households("user_1") })?.options;
    expect(getQueryOptions()).toMatchObject({ enabled: true });
    expect(getQueryOptions()).not.toHaveProperty("refetchInterval");

    await mocks.blur?.();
    await waitFor(() => expect(getQueryOptions()).toMatchObject({ enabled: false }));

    const cleanup = mocks.focus?.();
    mocks.blur = typeof cleanup === "function" ? cleanup : null;
    await waitFor(() => expect(mocks.api.listHouseholds).toHaveBeenCalledTimes(2));

    mocks.onRefresh?.();
    await waitFor(() => expect(mocks.api.listHouseholds).toHaveBeenCalledTimes(3));
  });

  it("normalizes invite codes, prevents duplicates, invalidates the exact key, and clears on success", async () => {
    const user = userEvent.setup();
    const joining = deferred<any>();
    mocks.api.joinHousehold.mockReturnValue(joining.promise);
    const client = createTestQueryClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    await renderWithQueryClient(<HouseholdsScreen />, client);
    await screen.findByText("No shared households yet");
    const input = await screen.findByLabelText("Invite code");

    await user.clear(input);
    await user.type(input, "  ab12cd34  ");
    await waitFor(() =>
      expect(screen.getByLabelText("Invite code").props.value).toBe("  ab12cd34  "),
    );
    await user.press(screen.getByRole("button", { name: "Join household" }));
    await waitFor(() => expect(mocks.api.joinHousehold).toHaveBeenCalledOnce());
    expect(mocks.api.joinHousehold.mock.calls[0]?.[0]).toBe("AB12CD34");

    joining.resolve({});
    await waitFor(() => expect(screen.getByLabelText("Invite code").props.value).toBe(""));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: groceryQueryKeys.households("user_1") });
  });

  it("treats whitespace as a no-op", async () => {
    const user = userEvent.setup();
    await renderWithQueryClient(<HouseholdsScreen />);
    await screen.findByText("No shared households yet");

    const householdInput = await screen.findByLabelText("Household name");
    const inviteInput = await screen.findByLabelText("Invite code");

    await user.clear(householdInput);
    await user.type(householdInput, "   ");
    await user.press(screen.getByRole("button", { name: "Create household" }));
    expect(mocks.api.createHousehold).not.toHaveBeenCalled();

    await user.clear(inviteInput);
    await user.type(inviteInput, "   ");
    await user.press(screen.getByRole("button", { name: "Join household" }));
    expect(mocks.api.joinHousehold).not.toHaveBeenCalled();
  });

  it("retains input when join fails", async () => {
    const user = userEvent.setup();
    const client = createTestQueryClient();
    mocks.api.joinHousehold.mockRejectedValue(new Error("Could not join household"));

    await renderWithQueryClient(<HouseholdsScreen />, client);
    const invite = await screen.findByLabelText("Invite code");
    await user.clear(invite);
    await user.type(invite, "  ab12cd34  ");
    await waitFor(() =>
      expect(screen.getByLabelText("Invite code").props.value).toBe("  ab12cd34  "),
    );
    await user.press(screen.getByRole("button", { name: "Join household" }));

    await waitFor(() => expect(mocks.api.joinHousehold).toHaveBeenCalledOnce());
    await waitFor(() => expect(screen.getByText("Could not join household")).toBeTruthy());
    expect(mocks.api.joinHousehold.mock.calls[0]?.[0]).toBe("AB12CD34");
    expect(screen.getByLabelText("Invite code").props.value).toBe("  ab12cd34  ");
  });
});
