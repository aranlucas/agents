import { act, screen, userEvent, waitFor } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SavedListScreen from "@/app/saved-list";
import SavedRecipeScreen from "@/app/saved-recipe";
import type {
  GroceryList,
  GroceryListItemPatch,
  NewGroceryListItem,
  Recipe,
  RecipeContent,
} from "@/lib/household-api";
import { groceryQueryKeys } from "@/lib/query-keys";
import { createTestQueryClient, renderWithQueryClient } from "../render";

type MockCheckboxProps = {
  accessibilityLabel?: string;
  checked?: boolean;
  disabled?: boolean;
  onCheckedChange?: (checked: boolean) => void;
};

const mocks = vi.hoisted(() => ({
  auth: {
    getToken: vi.fn<() => Promise<string | null>>(),
    userId: "user_1" as string | null,
  },
  api: {
    getList: vi.fn<(listId: string) => Promise<GroceryList>>(),
    updateList: vi.fn<(listId: string, patch: { title: string }) => Promise<GroceryList>>(),
    addItems: vi.fn<(listId: string, items: NewGroceryListItem[]) => Promise<unknown>>(),
    updateItem:
      vi.fn<(listId: string, itemId: string, patch: GroceryListItemPatch) => Promise<unknown>>(),
    deleteItem: vi.fn<(listId: string, itemId: string) => Promise<unknown>>(),
    getRecipe: vi.fn<(recipeId: string) => Promise<Recipe>>(),
    updateRecipe: vi.fn<(recipeId: string, content: RecipeContent) => Promise<Recipe>>(),
  },
  params: {} as Record<string, unknown>,
}));

vi.mock("@clerk/clerk-expo", () => ({ useAuth: () => mocks.auth }));
vi.mock("@/lib/config", () => ({ getRuntimeUrl: () => "https://runtime.test" }));
vi.mock("@/lib/household-api", () => ({ createHouseholdApi: () => mocks.api }));
vi.mock("expo-router", () => ({ useLocalSearchParams: () => mocks.params }));
vi.mock("lucide-react-native", () => ({
  Plus: () => null,
  Save: () => null,
  Trash2: () => null,
}));
vi.mock("@/components/ui/icon", () => ({ Icon: () => null }));
vi.mock("@/components/ui/checkbox", async () => {
  const React = await import("react");
  const { Pressable } = await import("react-native");
  return {
    Checkbox: ({
      accessibilityLabel,
      checked = false,
      disabled,
      onCheckedChange,
    }: MockCheckboxProps) =>
      React.createElement(Pressable, {
        accessibilityLabel,
        accessibilityRole: "checkbox",
        accessibilityState: { checked, disabled },
        disabled,
        onPress: () => onCheckedChange?.(!checked),
      }),
  };
});

function groceryList(overrides: Partial<GroceryList> = {}): GroceryList {
  return {
    id: "list_1",
    household_id: "house_1",
    owner_user_id: "user_1",
    title: "Weekly groceries",
    status: "active",
    created_at: 1,
    updated_at: 1,
    items: [],
    ...overrides,
  };
}

function recipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    id: "recipe_1",
    household_id: "house_1",
    owner_user_id: "user_1",
    title: "Pasta",
    description: "Original description",
    servings: "4",
    notes: "",
    status: "active",
    created_at: 1,
    updated_at: 1,
    ingredients: [],
    steps: [],
    tags: ["dinner"],
    ...overrides,
  };
}

beforeEach(() => {
  mocks.auth.userId = "user_1";
  mocks.params = {};
  for (const method of Object.values(mocks.api)) method.mockReset();
});

describe("saved resource editing", () => {
  it("keeps a dirty list title through a cache refresh, then refreshes it after save", async () => {
    const user = userEvent.setup();
    const initial = groceryList();
    mocks.params = { listId: initial.id };
    mocks.api.getList.mockResolvedValue(initial);
    const client = createTestQueryClient();
    await renderWithQueryClient(<SavedListScreen />, client);

    const title = await screen.findByLabelText("List title");
    await user.clear(title);
    await user.type(title, "Local weekend list");

    await act(async () => {
      client.setQueryData(
        groceryQueryKeys.list("user_1", initial.id),
        groceryList({ title: "Remote household title", updated_at: 2 }),
      );
    });

    await waitFor(() =>
      expect(screen.getByLabelText("List title").props.value).toBe("Local weekend list"),
    );

    const confirmed = groceryList({ title: "Local weekend list", updated_at: 3 });
    mocks.api.updateList.mockResolvedValue(confirmed);
    mocks.api.getList.mockResolvedValue(confirmed);
    await user.press(screen.getByRole("button", { name: "Save list title" }));

    await waitFor(() =>
      expect(mocks.api.updateList).toHaveBeenCalledWith(initial.id, {
        title: "Local weekend list",
      }),
    );
    await waitFor(() =>
      expect(screen.getByLabelText("List title").props.value).toBe(confirmed.title),
    );

    await act(async () => {
      client.setQueryData(
        groceryQueryKeys.list("user_1", initial.id),
        groceryList({ title: "Fresh server title", updated_at: 4 }),
      );
    });

    await waitFor(() =>
      expect(screen.getByLabelText("List title").props.value).toBe("Fresh server title"),
    );
  });

  it("preserves dirty recipe fields while refreshing pristine fields and resets after save", async () => {
    const user = userEvent.setup();
    const initial = recipe();
    mocks.params = { recipeId: initial.id };
    mocks.api.getRecipe.mockResolvedValue(initial);
    const client = createTestQueryClient();
    await renderWithQueryClient(<SavedRecipeScreen />, client);

    const title = await screen.findByLabelText("Title");
    await user.clear(title);
    await user.type(title, "Local pasta draft");

    const refreshed = recipe({
      title: "Remote pasta title",
      description: "Fresh household description",
      servings: "6",
      updated_at: 2,
    });
    await act(async () => {
      client.setQueryData(groceryQueryKeys.recipe("user_1", initial.id), refreshed);
    });

    await waitFor(() => {
      expect(screen.getByLabelText("Title").props.value).toBe("Local pasta draft");
      expect(screen.getByLabelText("Description").props.value).toBe("Fresh household description");
      expect(screen.getByLabelText("Servings").props.value).toBe("6");
    });

    const confirmed = recipe({
      ...refreshed,
      title: "Local pasta draft",
      description: "Confirmed description",
      updated_at: 3,
    });
    mocks.api.updateRecipe.mockResolvedValue(confirmed);
    await user.press(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(mocks.api.updateRecipe).toHaveBeenCalledOnce());
    await waitFor(() => {
      expect(screen.getByLabelText("Title").props.value).toBe(confirmed.title);
      expect(screen.getByLabelText("Description").props.value).toBe(confirmed.description);
    });

    await act(async () => {
      client.setQueryData(
        groceryQueryKeys.recipe("user_1", initial.id),
        recipe({
          title: "Next server title",
          description: "Next server description",
          updated_at: 4,
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByLabelText("Title").props.value).toBe("Next server title");
      expect(screen.getByLabelText("Description").props.value).toBe("Next server description");
    });
  });
});
