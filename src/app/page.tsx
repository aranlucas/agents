"use client";

import { useCoAgent } from "@copilotkit/react-core";
import { CopilotSidebar } from "@copilotkit/react-ui";
import { GlobeCanvas } from "@/components/globe-canvas";
import { ResultsCanvas } from "@/components/results-canvas";
import { getDateResults, getFlightResults } from "@/lib/state";
import type { AgentState, ArcDatum } from "@/lib/types";

const EMPTY_ARCS: ArcDatum[] = [];

function PlaneSvg() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ width: "1.25rem", height: "1.25rem", color: "var(--amber)" }}
    >
      <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
    </svg>
  );
}

export default function Page() {
  const { state } = useCoAgent<AgentState>({
    name: "my_agent",
    initialState: {},
  });

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <CopilotSidebar
        disableSystemMessage={true}
        clickOutsideToClose={false}
        defaultOpen={true}
        labels={{
          title: "Weekend Trips",
          initial: "Where do you want to escape to this weekend?",
        }}
        suggestions={[
          {
            title: "Best deals this weekend",
            message:
              "Scan the best weekend deals from Seattle this weekend — search cheapest dates to SFO, LAX, LAS, DEN, PHX, and ORD, one at a time. Wait 2 seconds between each search.",
          },
          {
            title: "Vegas this weekend",
            message: "Find flights from Seattle to Las Vegas this weekend",
          },
          {
            title: "SF getaway",
            message:
              "Cheapest weekend to fly from Seattle to San Francisco in the next 6 weeks?",
          },
          {
            title: "LA quick trip",
            message: "Direct flights from Seattle to Los Angeles next Saturday",
          },
        ]}
      >
        <ResultsCanvas state={state} />
      </CopilotSidebar>
    </main>
  );
}
