type SuggestionIdentity = {
  title: string;
  message: string;
};

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
