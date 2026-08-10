import createClient from "openapi-fetch";

import type { components, paths } from "./grocery-gateway";
import { runAuthenticated } from "./auth";

type GrocerySchema = components["schemas"];

export type HouseholdRole = "owner" | "member";
export type GroceryListStatus = "active" | "archived";

export type Household = GrocerySchema["Household"];
export type HouseholdInvite = GrocerySchema["Invite"];
export type GroceryListItem = GrocerySchema["Item"];
export type GroceryList = GrocerySchema["List"];
export type RecipeIngredient = GrocerySchema["Ingredient"];
export type RecipeStep = GrocerySchema["RecipeStep"];
export type Recipe = GrocerySchema["Recipe"];
export type NewRecipeIngredient = GrocerySchema["NewIngredient"];
export type RecipeContent = GrocerySchema["RecipeContent"];
export type NewGroceryListItem = GrocerySchema["NewItem"];
export type GroceryListItemPatch = GrocerySchema["ItemPatch"];

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

type ApiResult<TResult> = {
  data?: TResult;
  error?: unknown;
  response: Response;
};

const errorMessages: Record<string, string> = {
  grocery_forbidden: "You no longer have access to that household.",
  grocery_invite_expired: "That invite has expired. Ask the household owner for a new one.",
  grocery_invite_exhausted: "That invite has reached its usage limit.",
  grocery_not_found: "That shared list could not be found.",
  saved_recipe_not_found: "That saved recipe could not be found.",
  invalid_grocery_request: "Check the values and try again.",
};

function errorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("error" in error)) return undefined;
  return typeof error.error === "string" ? error.error : undefined;
}

export function createHouseholdApi({
  baseUrl,
  getToken,
  userId,
  fetcher = globalThis.fetch,
}: HouseholdApiOptions) {
  const client = createClient<paths>({ baseUrl: baseUrl.replace(/\/$/u, ""), fetch: fetcher });

  async function request<TResult>(
    execute: (headers: Record<string, string>) => Promise<ApiResult<TResult>>,
  ): Promise<TResult> {
    const transport = {
      headers: { Accept: "application/json" } as Record<string, string>,
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
        let result: ApiResult<TResult>;
        try {
          result = await execute(transport.headers);
        } catch {
          throw new HouseholdApiError("Could not reach Grocery Agent. Check your connection.", 0);
        }

        if (!result.response.ok) {
          const code = errorCode(result.error);
          throw new HouseholdApiError(
            (code && errorMessages[code]) || "The shared list request failed. Try again.",
            result.response.status,
            code,
          );
        }
        return result.data as TResult;
      },
    });
  }

  return {
    listHouseholds: () =>
      request<Household[]>((headers) => client.GET("/api/grocery/households", { headers })),
    createHousehold: (name: string) =>
      request<Household>((headers) =>
        client.POST("/api/grocery/households", { headers, body: { name } }),
      ),
    createInvite: (householdId: string, maxUses = 10) =>
      request<HouseholdInvite>((headers) =>
        client.POST("/api/grocery/households/{id}/invites", {
          headers,
          params: { path: { id: householdId } },
          body: { max_uses: maxUses },
        }),
      ),
    joinHousehold: (code: string) =>
      request<Household>((headers) =>
        client.POST("/api/grocery/invites/{code}/join", {
          headers,
          params: { path: { code: code.trim() } },
        }),
      ),
    listLists: (householdId?: string) =>
      request<GroceryList[]>((headers) =>
        client.GET("/api/grocery/lists", {
          headers,
          params: { query: householdId ? { householdId } : {} },
        }),
      ),
    getList: (listId: string) =>
      request<GroceryList>((headers) =>
        client.GET("/api/grocery/lists/{id}", {
          headers,
          params: { path: { id: listId } },
        }),
      ),
    createList: (title: string, householdId?: string, items?: NewGroceryListItem[]) =>
      request<GroceryList>((headers) =>
        client.POST("/api/grocery/lists", {
          headers,
          body: { household_id: householdId, title, items },
        }),
      ),
    updateList: (listId: string, patch: { title?: string; status?: GroceryListStatus }) =>
      request<GroceryList>((headers) =>
        client.PATCH("/api/grocery/lists/{id}", {
          headers,
          params: { path: { id: listId } },
          body: patch,
        }),
      ),
    addItems: (listId: string, items: NewGroceryListItem[]) =>
      request<GroceryListItem[]>((headers) =>
        client.POST("/api/grocery/lists/{id}/items", {
          headers,
          params: { path: { id: listId } },
          body: { items },
        }),
      ),
    updateItem: (listId: string, itemId: string, patch: GroceryListItemPatch) =>
      request<GroceryListItem>((headers) =>
        client.PATCH("/api/grocery/lists/{id}/items/{itemId}", {
          headers,
          params: { path: { id: listId, itemId } },
          body: patch,
        }),
      ),
    deleteItem: (listId: string, itemId: string) =>
      request<void>((headers) =>
        client.DELETE("/api/grocery/lists/{id}/items/{itemId}", {
          headers,
          params: { path: { id: listId, itemId } },
        }),
      ),
    listRecipes: (householdId?: string) =>
      request<Recipe[]>((headers) =>
        client.GET("/api/grocery/recipes", {
          headers,
          params: { query: householdId ? { householdId } : {} },
        }),
      ),
    getRecipe: (recipeId: string) =>
      request<Recipe>((headers) =>
        client.GET("/api/grocery/recipes/{id}", {
          headers,
          params: { path: { id: recipeId } },
        }),
      ),
    createRecipe: (content: RecipeContent, householdId?: string) =>
      request<Recipe>((headers) =>
        client.POST("/api/grocery/recipes", {
          headers,
          body: { household_id: householdId, ...content },
        }),
      ),
    updateRecipe: (recipeId: string, content: RecipeContent) =>
      request<Recipe>((headers) =>
        client.PUT("/api/grocery/recipes/{id}", {
          headers,
          params: { path: { id: recipeId } },
          body: content,
        }),
      ),
  };
}

export type HouseholdApi = ReturnType<typeof createHouseholdApi>;
