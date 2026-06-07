import type { WellnessState } from "@agents/types";
import { AgentScreen, Field, SummaryCard } from "@/components/agent-screen";

const WELLNESS_CONFIG = {
  id: "wellness" as const,
  title: "Wellness Planner",
  subtitle: "Coordinate grocery and fitness plans together.",
  placeholder: "Plan my week...",
  accentColor: "#7c3aed",
  renderSummary: (state: WellnessState) =>
    state.weekly_plan || state.meal_plan || state.workout_plan ? (
      <SummaryCard>
        <Field label="Status" value={state.status} />
        <Field label="Weekly plan" value={state.weekly_plan} />
        <Field label="Workout plan" value={state.workout_plan} />
        <Field label="Meal plan" value={state.meal_plan} />
      </SummaryCard>
    ) : null,
};

export default function WellnessScreen() {
  return <AgentScreen<WellnessState> config={WELLNESS_CONFIG} initialState={{}} />;
}
