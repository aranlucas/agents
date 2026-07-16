type SuggestionIdentity = {
  title: string;
  message: string;
};

type GrocerySuggestionTheme = SuggestionIdentity & {
  isLoading: false;
};

export const GROCERY_SUGGESTION_THEMES: GrocerySuggestionTheme[] = [
  {
    title: "Plan meals on a budget",
    message: "Plan five practical dinners for two people with a $100 grocery budget.",
    isLoading: false,
  },
  {
    title: "Shop this week’s deals",
    message: "Use this week’s Kroger deals to suggest healthy meals and build my grocery list.",
    isLoading: false,
  },
  {
    title: "Restock my pantry",
    message: "Check my pantry and recent purchases, then suggest what I should restock.",
    isLoading: false,
  },
];

export function suggestionKey(suggestion: SuggestionIdentity): string {
  return JSON.stringify([suggestion.title, suggestion.message]);
}

export function uniqueSuggestions<T extends SuggestionIdentity>(suggestions: readonly T[]): T[] {
  const seen = new Set<string>();
  return suggestions.filter((suggestion) => {
    const key = suggestionKey(suggestion);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
