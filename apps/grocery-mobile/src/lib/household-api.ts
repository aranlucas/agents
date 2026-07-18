import { runAuthenticated } from "./auth";

export type HouseholdRole = "owner" | "member";
export type GroceryListStatus = "active" | "archived";

export type Household = {
  id: string;
  name: string;
  role: HouseholdRole;
  created_by: string;
  created_at: number;
};

export type HouseholdInvite = {
  code: string;
  household_id: string;
  created_by: string;
  expires_at: number;
  max_uses: number;
  used_count: number;
};

export type GroceryListItem = {
  id: string;
  list_id: string;
  name: string;
  quantity: string;
  note: string | null;
  position: number;
  added_by: string;
  checked_by: string | null;
  checked_at: number | null;
  updated_at: number;
};

export type GroceryList = {
  id: string;
  household_id: string | null;
  owner_user_id: string;
  title: string;
  status: GroceryListStatus;
  artifact_version?: number;
  created_at: number;
  updated_at: number;
  items: GroceryListItem[];
};

export type RecipeIngredient = {
  id: string;
  recipe_id: string;
  name: string;
  quantity: string;
  unit: string;
  note: string;
  position: number;
};

export type RecipeStep = {
  id: string;
  recipe_id: string;
  instruction: string;
  position: number;
};

export type Recipe = {
  id: string;
  household_id: string | null;
  owner_user_id: string;
  title: string;
  description: string;
  servings: string;
  notes: string;
  status: GroceryListStatus;
  artifact_version?: number;
  created_at: number;
  updated_at: number;
  ingredients: RecipeIngredient[];
  steps: RecipeStep[];
  tags: string[];
};

export type NewRecipeIngredient = {
  name: string;
  quantity?: string;
  unit?: string;
  note?: string;
};

export type RecipeContent = {
  title: string;
  description?: string;
  servings?: string;
  notes?: string;
  ingredients: NewRecipeIngredient[];
  steps: string[];
  tags?: string[];
};

export type NewGroceryListItem = {
  name: string;
  quantity?: string;
  note?: string;
};

export type GroceryListItemPatch = {
  name?: string;
  quantity?: string;
  note?: string;
  checked?: boolean;
};

export class HouseholdApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "HouseholdApiError";
  }
}

type HouseholdApiOptions = {
  baseUrl: string;
  getToken: () => Promise<string | null>;
  userId: string | null | undefined;
  fetcher?: typeof globalThis.fetch;
};

const errorMessages: Record<string, string> = {
  grocery_forbidden: "You no longer have access to that household.",
  grocery_invite_expired: "That invite has expired. Ask the household owner for a new one.",
  grocery_invite_exhausted: "That invite has reached its usage limit.",
  grocery_not_found: "That shared list could not be found.",
  saved_recipe_not_found: "That saved recipe could not be found.",
  invalid_grocery_request: "Check the values and try again.",
};

export function createHouseholdApi({
  baseUrl,
  getToken,
  userId,
  fetcher = globalThis.fetch,
}: HouseholdApiOptions) {
  const root = baseUrl.replace(/\/$/u, "");

  async function request<TResult>(path: string, init: RequestInit = {}): Promise<TResult> {
    const transport = {
      headers: {
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      } as Record<string, string>,
      setHeaders(headers: Record<string, string | null | undefined>) {
        this.headers = Object.fromEntries(
          Object.entries(headers).filter((entry): entry is [string, string] => Boolean(entry[1])),
        );
      },
    };

    return runAuthenticated({
      transport,
      getToken,
      userId,
      run: async () => {
        let response: Response;
        try {
          response = await fetcher(`${root}${path}`, { ...init, headers: transport.headers });
        } catch {
          throw new HouseholdApiError("Could not reach Grocery Agent. Check your connection.", 0);
        }
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null;
          const code = payload?.error;
          throw new HouseholdApiError(
            (code && errorMessages[code]) || "The shared list request failed. Try again.",
            response.status,
            code,
          );
        }
        if (response.status === 204) return undefined as TResult;
        return (await response.json()) as TResult;
      },
    });
  }

  return {
    listHouseholds: () => request<Household[]>("/api/grocery/households"),
    createHousehold: (name: string) =>
      request<Household>("/api/grocery/households", {
        method: "POST",
        body: JSON.stringify({ name }),
      }),
    createInvite: (householdId: string, maxUses = 10) =>
      request<HouseholdInvite>(
        `/api/grocery/households/${encodeURIComponent(householdId)}/invites`,
        { method: "POST", body: JSON.stringify({ max_uses: maxUses }) },
      ),
    joinHousehold: (code: string) =>
      request<Household>(`/api/grocery/invites/${encodeURIComponent(code.trim())}/join`, {
        method: "POST",
      }),
    listLists: (householdId?: string) =>
      request<GroceryList[]>(
        householdId
          ? `/api/grocery/lists?householdId=${encodeURIComponent(householdId)}`
          : "/api/grocery/lists",
      ),
    getList: (listId: string) =>
      request<GroceryList>(`/api/grocery/lists/${encodeURIComponent(listId)}`),
    createList: (title: string, householdId?: string, items?: NewGroceryListItem[]) =>
      request<GroceryList>("/api/grocery/lists", {
        method: "POST",
        body: JSON.stringify({ household_id: householdId, title, items }),
      }),
    updateList: (listId: string, patch: { title?: string; status?: GroceryListStatus }) =>
      request<GroceryList>(`/api/grocery/lists/${encodeURIComponent(listId)}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    addItems: (listId: string, items: NewGroceryListItem[]) =>
      request<GroceryListItem[]>(`/api/grocery/lists/${encodeURIComponent(listId)}/items`, {
        method: "POST",
        body: JSON.stringify({ items }),
      }),
    updateItem: (listId: string, itemId: string, patch: GroceryListItemPatch) =>
      request<GroceryListItem>(
        `/api/grocery/lists/${encodeURIComponent(listId)}/items/${encodeURIComponent(itemId)}`,
        { method: "PATCH", body: JSON.stringify(patch) },
      ),
    deleteItem: (listId: string, itemId: string) =>
      request<void>(
        `/api/grocery/lists/${encodeURIComponent(listId)}/items/${encodeURIComponent(itemId)}`,
        { method: "DELETE" },
      ),
    listRecipes: (householdId?: string) =>
      request<Recipe[]>(
        householdId
          ? `/api/grocery/recipes?householdId=${encodeURIComponent(householdId)}`
          : "/api/grocery/recipes",
      ),
    getRecipe: (recipeId: string) =>
      request<Recipe>(`/api/grocery/recipes/${encodeURIComponent(recipeId)}`),
    createRecipe: (content: RecipeContent, householdId?: string) =>
      request<Recipe>("/api/grocery/recipes", {
        method: "POST",
        body: JSON.stringify({ household_id: householdId, ...content }),
      }),
    updateRecipe: (recipeId: string, content: RecipeContent) =>
      request<Recipe>(`/api/grocery/recipes/${encodeURIComponent(recipeId)}`, {
        method: "PUT",
        body: JSON.stringify(content),
      }),
  };
}

export type HouseholdApi = ReturnType<typeof createHouseholdApi>;
