import { renderHook, waitFor } from "@testing-library/react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSavedResources } from "@/hooks/use-saved-resources";
import type { GroceryList, Household } from "@/lib/household-api";
import { groceryQueryKeys } from "@/lib/query-keys";
import { createTestQueryClient } from "../render";

const mocks = vi.hoisted(() => ({
  auth: {
    getToken: vi.fn<() => Promise<string | null>>(),
    userId: "user_1" as string | null,
  },
  api: {
    listHouseholds: vi.fn<() => Promise<Household[]>>(),
    listLists: vi.fn<(householdId?: string) => Promise<GroceryList[]>>(),
  },
}));

vi.mock("@clerk/expo", () => ({ useAuth: () => mocks.auth }));
vi.mock("@/lib/config", () => ({ getRuntimeUrl: () => "https://runtime.test" }));
vi.mock("@/lib/household-api", () => ({ createHouseholdApi: () => mocks.api }));

function household(id: string, name: string): Household {
  return { id, name, role: "member", created_by: "owner_1", created_at: 1 };
}

function list(id: string, title: string, householdId: string | null): GroceryList {
  return {
    id,
    household_id: householdId,
    owner_user_id: "user_1",
    title,
    status: "active",
    created_at: 1,
    updated_at: 1,
    items: [],
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

async function setup() {
  const client = createTestQueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const hook = await renderHook(
    () =>
      useSavedResources({
        queryKey: groceryQueryKeys.lists,
        load: (api, householdId) => api.listLists(householdId),
      }),
    { wrapper },
  );
  return { client, hook };
}

beforeEach(() => {
  mocks.auth.userId = "user_1";
  mocks.auth.getToken.mockReset();
  mocks.api.listHouseholds.mockReset();
  mocks.api.listLists.mockReset();
});

describe("useSavedResources", () => {
  it("keeps personal and household resources ordered and isolated by cache key", async () => {
    const home = household("house_1", "Home");
    const cabin = household("house_2", "Cabin");
    const personal = list("list_personal", "Personal staples", null);
    const homeList = list("list_home", "Home groceries", home.id);
    const cabinList = list("list_cabin", "Cabin groceries", cabin.id);
    mocks.api.listHouseholds.mockResolvedValue([home, cabin]);
    mocks.api.listLists.mockImplementation(async (householdId) => {
      if (householdId === home.id) return [homeList];
      if (householdId === cabin.id) return [cabinList];
      return [personal];
    });

    const { client, hook } = await setup();

    await waitFor(() => {
      expect(hook.result.current.loading).toBe(false);
      expect(hook.result.current.resources).toEqual([
        { resource: personal, location: "Personal" },
        { resource: homeList, location: "Home" },
        { resource: cabinList, location: "Cabin" },
      ]);
    });

    expect(client.getQueryData(groceryQueryKeys.households("user_1"))).toEqual([home, cabin]);
    expect(client.getQueryData(groceryQueryKeys.lists("user_1", null))).toEqual([personal]);
    expect(client.getQueryData(groceryQueryKeys.lists("user_1", home.id))).toEqual([homeList]);
    expect(client.getQueryData(groceryQueryKeys.lists("other_user", null))).toBeUndefined();
  });

  it("disables all collection requests without an authenticated user", async () => {
    mocks.auth.userId = null;

    const { client, hook } = await setup();

    await waitFor(() => expect(hook.result.current.userId).toBeNull());
    expect(mocks.api.listHouseholds).not.toHaveBeenCalled();
    expect(mocks.api.listLists).not.toHaveBeenCalled();
    expect(client.isFetching()).toBe(0);
    expect(hook.result.current.resources).toEqual([]);
  });

  it("stays loading while a household fanout request is pending", async () => {
    const home = household("house_1", "Home");
    const personal = list("list_personal", "Personal staples", null);
    const homeList = list("list_home", "Home groceries", home.id);
    const pendingHouseholdList = deferred<GroceryList[]>();
    mocks.api.listHouseholds.mockResolvedValue([home]);
    mocks.api.listLists.mockImplementation((householdId) =>
      householdId ? pendingHouseholdList.promise : Promise.resolve([personal]),
    );

    const { hook } = await setup();

    await waitFor(() => {
      expect(hook.result.current.resources).toEqual([{ resource: personal, location: "Personal" }]);
      expect(hook.result.current.loading).toBe(true);
    });

    pendingHouseholdList.resolve([homeList]);
    await waitFor(() => {
      expect(hook.result.current.loading).toBe(false);
      expect(hook.result.current.resources).toEqual([
        { resource: personal, location: "Personal" },
        { resource: homeList, location: "Home" },
      ]);
    });
  });
});
