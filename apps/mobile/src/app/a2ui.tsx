import type { A2UIState } from "@agents/types";
import { AgentScreen, Field, SummaryCard } from "@/components/agent-screen";

const A2UI_CONFIG = {
  id: "a2ui" as const,
  title: "A2UI Showcase",
  subtitle: "Test the ADK agent's AG-UI event stream.",
  placeholder: "Render a demo surface...",
  accentColor: "#0f766e",
  renderSummary: (state: A2UIState) =>
    state.surface_brief || state.last_surface ? (
      <SummaryCard>
        <Field label="Status" value={state.status} />
        <Field label="Surface brief" value={state.surface_brief} />
        <Field label="Last surface" value={state.last_surface} />
      </SummaryCard>
    ) : null,
};

export default function A2UIScreen() {
  return <AgentScreen<A2UIState> config={A2UI_CONFIG} initialState={{}} />;
}
