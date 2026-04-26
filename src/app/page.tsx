"use client";

import { useCoAgent } from "@copilotkit/react-core";
import { CopilotSidebar } from "@copilotkit/react-ui";
import { ResultsCanvas } from "@/components/results-canvas";
import { ToolRenderer } from "@/components/ToolRenderer";
import type { AgentState } from "@/lib/types";

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
        }}
      >
        <ResultsCanvas state={state} />
      </CopilotSidebar>
      <ToolRenderer />
    </main>
  );
}
