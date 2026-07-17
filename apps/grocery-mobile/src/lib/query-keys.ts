export const groceryQueryKeys = {
  copilotSession: (userId: string | null | undefined) => ["clerk-grocery-token", userId] as const,
  krogerConnection: (userId: string | null | undefined) =>
    ["clerk-user", "kroger-connection", userId] as const,
  krogerCallback: (userId: string | null | undefined) =>
    ["kroger-connection-callback", userId] as const,
  households: (userId: string | null | undefined) => ["grocery-households", userId] as const,
  lists: (userId: string | null | undefined, householdId: string | null | undefined) =>
    ["grocery-lists", userId, householdId] as const,
  list: (userId: string | null | undefined, listId: string | null | undefined) =>
    ["grocery-list", userId, listId] as const,
  recipes: (userId: string | null | undefined, householdId?: string | null) =>
    ["grocery-recipes", userId, householdId ?? "personal"] as const,
  recipe: (userId: string | null | undefined, recipeId: string | null | undefined) =>
    ["grocery-recipe", userId, recipeId] as const,
};
