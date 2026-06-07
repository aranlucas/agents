import type { TripState } from "@agents/types";
import { AgentScreen, Field, SummaryCard } from "@/components/agent-screen";

const TRAVEL_CONFIG = {
  id: "travel" as const,
  title: "Trip Planner",
  subtitle: "Tell me where you want to go.",
  placeholder: "Plan a trip...",
  accentColor: "#b45309",
  renderSummary: (state: TripState) =>
    state.destination ? (
      <SummaryCard>
        <Field label="Destination" value={state.destination} />
        <Field label="Headline" value={state.headline} />
        <Field
          label="Dates"
          value={
            state.start_date && state.end_date
              ? `${state.start_date} to ${state.end_date}`
              : undefined
          }
        />
        <Field label="Travelers" value={state.travelers} />
        <Field label="Status" value={state.status} />
      </SummaryCard>
    ) : null,
};

export default function TravelScreen() {
  return <AgentScreen<TripState> config={TRAVEL_CONFIG} initialState={{}} />;
}
