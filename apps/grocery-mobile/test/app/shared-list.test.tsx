import { screen, userEvent, waitFor } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestQueryClient, renderWithQueryClient } from "../render";
import { groceryQueryKeys } from "@/lib/query-keys";
import SharedListScreen from "@/app/shared-list";

const mocks = vi.hoisted(() => ({
  auth: { getToken: vi.fn(), userId: "user_1" as string | null },
  api: {
    listLists: vi.fn(),
    getList: vi.fn(),
    createList: vi.fn(),
    addItems: vi.fn(),
    updateItem: vi.fn(),
    deleteItem: vi.fn(),
  },
  params: { householdId: "house_1", householdName: "Roommates" } as Record<string, unknown>,
  focus: null as null | (() => void | (() => void)),
  blur: null as null | (() => void),
  onRefresh: null as null | (() => void),
}));

vi.mock("@clerk/expo", () => ({ useAuth: () => mocks.auth }));
vi.mock("@/lib/config", () => ({ getRuntimeUrl: () => "https://runtime.test" }));
vi.mock("@/lib/household-api", () => ({ createHouseholdApi: () => mocks.api }));
vi.mock("lucide-react-native", () => ({
  ListPlus: () => null,
  Plus: () => null,
  Trash2: () => null,
}));
vi.mock("@/components/ui/icon", () => ({ Icon: () => null }));
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
vi.mock("@/components/ui/checkbox", async () => {
  const React = await import("react");
  const { Pressable } = await import("react-native");
  return {
    Checkbox: ({ accessibilityLabel, checked, disabled, onCheckedChange }: any) =>
      React.createElement(Pressable, {
        accessibilityLabel,
        accessibilityRole: "checkbox",
        accessibilityState: { checked, disabled },
        disabled,
        onPress: () => onCheckedChange(!checked),
      }),
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
    useLocalSearchParams: () => mocks.params,
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

function list(id: string, title: string, items: any[] = []) {
  return {
    id,
    household_id: "house_1",
    owner_user_id: "user_1",
    title,
    status: "active",
    created_at: 1,
    updated_at: 1,
    items,
  };
}

function item(id: string, name: string) {
  return {
    id,
    list_id: "list_1",
    name,
    quantity: "1",
    note: null,
    position: 0,
    added_by: "user_1",
    checked_by: null,
    checked_at: null,
    updated_at: 1,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

beforeEach(() => {
  mocks.auth.userId = "user_1";
  mocks.params = { householdId: "house_1", householdName: "Roommates" };
  for (const method of Object.values(mocks.api)) method.mockReset();
  mocks.api.listLists.mockResolvedValue([]);
  mocks.focus = null;
  mocks.blur = null;
  mocks.onRefresh = null;
});

describe("SharedListScreen", () => {
  it("owns focused collection/detail queries, radio selection, refresh, and empty states", async () => {
    const user = userEvent.setup();
    const weekly = list("list_1", "Weekly", [item("item_1", "Milk")]);
    const party = list("list_2", "Party", []);
    mocks.api.listLists.mockResolvedValue([weekly, party]);
    mocks.api.getList.mockImplementation(async (id: string) => (id === weekly.id ? weekly : party));
    const client = createTestQueryClient();
    await renderWithQueryClient(<SharedListScreen />, client);
    await Promise.resolve();
    await Promise.resolve();
    await mocks.focus?.();
    await waitFor(() => expect(mocks.api.listLists).toHaveBeenCalled());

    await screen.findByText("Milk");
    expect(screen.getByLabelText("Grocery list selector").props.accessibilityRole).toBe(
      "radiogroup",
    );
    expect(screen.getByRole("radio", { name: "Weekly" }).props.accessibilityState.checked).toBe(
      true,
    );

    await user.press(screen.getByRole("radio", { name: "Party" }));
    await Promise.resolve();
    await screen.findByText("No items yet");
    expect(screen.getByRole("radio", { name: "Party" }).props.accessibilityState.checked).toBe(
      true,
    );

    mocks.onRefresh?.();
    await waitFor(() => expect(mocks.api.listLists).toHaveBeenCalledTimes(2));
    expect(mocks.api.getList).toHaveBeenCalledTimes(3);

    await mocks.blur?.();
    await Promise.resolve();
    await Promise.resolve();
    await waitFor(() => {
      const listsOptions = client.getQueryCache().find({
        queryKey: groceryQueryKeys.lists("user_1", "house_1"),
      })?.options as { enabled?: boolean } | undefined;
      expect(listsOptions?.enabled).toBe(false);
    });
    await waitFor(() => {
      const detailOptions = client.getQueryCache().find({
        queryKey: groceryQueryKeys.list("user_1", "list_2"),
      })?.options as { enabled?: boolean } | undefined;
      expect(detailOptions?.enabled).toBe(false);
    });
  });

  it("guards list creation and seeds only the collection and created detail caches", async () => {
    const user = userEvent.setup();
    const created = list("list_new", "Weekend", []);
    const creating = deferred<any>();
    mocks.api.createList.mockReturnValue(creating.promise);
    const client = createTestQueryClient();
    const setQueryData = vi.spyOn(client, "setQueryData");
    await renderWithQueryClient(<SharedListScreen />, client);
    await screen.findByText("Start a shared list");
    await Promise.resolve();
    await Promise.resolve();
    const input = screen.getByLabelText("List title");

    await user.clear(input);
    await user.type(input, "   ");
    await user.press(screen.getByRole("button", { name: "Create shared list" }));
    expect(mocks.api.createList).not.toHaveBeenCalled();

    await user.clear(input);
    await user.type(input, "  Weekend  ");
    await waitFor(() =>
      expect(screen.getByLabelText("List title").props.value).toBe("  Weekend  "),
    );
    await user.press(screen.getByRole("button", { name: "Create shared list" }));
    await waitFor(() => expect(mocks.api.createList).toHaveBeenCalledOnce());
    expect(mocks.api.createList).toHaveBeenCalledWith("Weekend", "house_1");

    mocks.api.getList.mockResolvedValue(created);
    creating.resolve(created);
    await Promise.resolve();
    await Promise.resolve();
    await screen.findByText("No items yet");
    expect(screen.queryByLabelText("List title")).toBeNull();
    expect(setQueryData).toHaveBeenCalledWith(
      groceryQueryKeys.lists("user_1", "house_1"),
      expect.any(Function),
    );
    expect(setQueryData).toHaveBeenCalledWith(groceryQueryKeys.list("user_1", "list_new"), created);
    expect(setQueryData).toHaveBeenCalledTimes(2);
  });

  it("retains failed item input, invalidates only detail on success, and mutates a checkbox once", async () => {
    const user = userEvent.setup();
    const active = list("list_1", "Weekly", [item("item_1", "Milk")]);
    mocks.api.listLists.mockResolvedValue([active]);
    mocks.api.getList.mockResolvedValue(active);
    mocks.api.addItems
      .mockRejectedValueOnce(new Error("Could not add item"))
      .mockResolvedValueOnce([]);
    mocks.api.updateItem.mockResolvedValue({});
    const client = createTestQueryClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    await renderWithQueryClient(<SharedListScreen />, client);
    await mocks.focus?.();
    await waitFor(() => expect(mocks.api.listLists).toHaveBeenCalled());
    await screen.findByText("Milk");
    const input = screen.getByLabelText("New grocery item");
    await Promise.resolve();
    await Promise.resolve();

    await user.clear(input);
    await user.type(input, "  Eggs  ");
    await user.press(screen.getByRole("button", { name: "Add item" }));
    await screen.findByText("Could not add item");
    await waitFor(() =>
      expect(screen.getByLabelText("New grocery item").props.value).toBe("  Eggs  "),
    );

    await user.press(screen.getByRole("button", { name: "Add item" }));
    await waitFor(() => expect(screen.getByLabelText("New grocery item").props.value).toBe(""));
    expect(invalidate).toHaveBeenLastCalledWith({
      queryKey: groceryQueryKeys.list("user_1", "list_1"),
    });

    await user.press(screen.getByRole("checkbox", { name: "Check Milk" }));
    expect(mocks.api.updateItem).toHaveBeenCalledOnce();
    expect(mocks.api.updateItem).toHaveBeenCalledWith("list_1", "item_1", { checked: true });
  });
});
