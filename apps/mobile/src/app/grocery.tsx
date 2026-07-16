import type { GroceryState } from "@agents/types";
import { AgentScreen, Field, SummaryCard } from "@/components/agent-screen";
import { GroceryProductResultsTool } from "@/components/product-results-tool";

const GROCERY_CONFIG = {
  id: "grocery" as const,
  title: "Grocery Planner",
  subtitle: "Ask me to plan meals or build a shopping list.",
  placeholder: "Plan meals, find deals...",
  accentColor: "#15803d",
  renderSummary: (state: GroceryState) =>
    state.shopping_list?.length || state.meal_plan ? (
      <SummaryCard>
        <Field label="Status" value={state.status} />
        <Field label="Kroger" value={state.kroger_connected ? "Connected" : undefined} />
        <Field label="Meal plan" value={state.meal_plan} />
        <Field label="Shopping list" value={state.shopping_list?.join(", ")} />
      </SummaryCard>
    ) : null,
};

export default function GroceryScreen() {
  return (
    <>
      <GroceryProductResultsTool />
      <AgentScreen<GroceryState> config={GROCERY_CONFIG} initialState={{}} />
    </>
  );
}
