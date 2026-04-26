"use client";

import { useCoAgent } from "@copilotkit/react-core";
import { CopilotSidebar } from "@copilotkit/react-ui";
import { GlobeCanvas } from "@/components/globe-canvas";
import { ResultsCanvas } from "@/components/results-canvas";
import { ToolRenderer } from "@/components/ToolRenderer";
import { getDateResults, getFlightResults } from "@/lib/state";
import type { AgentState, ArcDatum } from "@/lib/types";

const EMPTY_ARCS: ArcDatum[] = [];

export default function Page() {
  const { state } = useCoAgent<AgentState>({
    name: "my_agent",
    initialState: {},
  });

  const flights = getFlightResults(state);
  const dates = getDateResults(state);
  const arcs: ArcDatum[] = flights.map((f, i) => ({
    startLat: 47.45,
    startLng: -122.31,
    endLat: f.legs[0]?.arrival_airport === "SFO"
      ? 37.62
      : f.legs[0]?.arrival_airport === "LAX"
      ? 33.94
      : f.legs[0]?.arrival_airport === "LAS"
      ? 36.08
      : 40.71,
    endLng:
      f.legs[0]?.arrival_airport === "SFO"
        ? -122.38
        : f.legs[0]?.arrival_airport === "LAX"
        ? -118.41
        : f.legs[0]?.arrival_airport === "LAS"
        ? -115.15
        : -74.01,
    color: `hsl(${(i * 60) % 360}, 80%, 60%)`,
    strokeWidth: 2,
  }));

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <GlobeCanvas arcs={arcs.length > 0 ? arcs : EMPTY_ARCS} />
      <CopilotSidebar
        disableSystemMessage={true}
        clickOutsideToClose={false}
        defaultOpen={true}
        labels={{
          title: "Weekend Trips",
        }}
      >
        <ResultsCanvas state={state} />
      </CopilotSidebar>
      <ToolRenderer />
    </main>
  );
}
