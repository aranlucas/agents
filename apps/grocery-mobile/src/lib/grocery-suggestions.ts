export type GrocerySuggestion = {
  title: string;
  message: string;
};

export const GROCERY_SUGGESTIONS: GrocerySuggestion[] = [
  {
    title: "Plan meals on a budget",
    message: "Plan five practical dinners for two people with a $100 grocery budget.",
  },
  {
    title: "Shop this week’s deals",
    message: "Use this week’s Kroger deals to suggest healthy meals and build my grocery list.",
  },
  {
    title: "Restock my pantry",
    message: "Check my pantry and recent purchases, then suggest what I should restock.",
  },
];
