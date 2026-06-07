import type { FitnessState } from "@agents/types";
import { AgentScreen, Field, SummaryCard } from "@/components/agent-screen";

const FITNESS_CONFIG = {
  id: "fitness" as const,
  title: "Fitness Planner",
  subtitle: "Build training plans from goals and Strava context.",
  placeholder: "Plan my training...",
  accentColor: "#2563eb",
  renderSummary: (state: FitnessState) =>
    state.training_plan || state.activities?.length ? (
      <SummaryCard>
        <Field label="Status" value={state.status} />
        <Field label="Strava" value={state.strava_connected ? "Connected" : undefined} />
        <Field label="Activities" value={state.activities?.length} />
        <Field label="Training plan" value={state.training_plan} />
      </SummaryCard>
    ) : null,
};

export default function FitnessScreen() {
  return <AgentScreen<FitnessState> config={FITNESS_CONFIG} initialState={{}} />;
}
