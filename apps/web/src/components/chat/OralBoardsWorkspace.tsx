"use client";

import { useRouter } from "next/navigation";
import { useAgent, UseAgentUpdate } from "@copilotkit/react-core/v2";

import type { OralBoardsState } from "@agents/types";
import { getAgentConfig } from "@/components/chat/agents/registry";
import { useNewThread } from "@/components/chat/use-new-thread";
import { AgentExtensionSlot } from "@/components/chat/agents/extensions";
import { AgentSuggestions } from "@/components/chat/agents/suggestions";
import { ChatSurface } from "@/components/chat/ChatSurface";
import { NavRail } from "@/components/chat/NavRail";
import { OralBoardsPanel } from "@/components/chat/oral-boards/OralBoardsPanel";
import { WorkspaceShell, useArtifactPanel } from "@/components/workspace-shell";
import { cssVars } from "@/lib/css";

const AGENT_ID = "oral-boards" as const;

/**
 * Bespoke Oral Boards console: same chat shell as AgentWorkspace, but the side
 * pane is the OralBoardsPanel (case / question / feedback) rather than the
 * generic artifact panel. Must render inside the agent's <ConsoleSession>.
 */
export function OralBoardsWorkspace() {
  const router = useRouter();
  const config = getAgentConfig(AGENT_ID);
  const { state, dispatch } = useArtifactPanel(AGENT_ID);
  const { agent } = useAgent({ agentId: AGENT_ID, updates: [UseAgentUpdate.OnStateChanged] });
  const startNewThread = useNewThread(AGENT_ID);

  // CopilotKit agent state is intentionally dynamic; the panel validates the
  // fields it needs.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const examState = (agent?.state ?? {}) as OralBoardsState;
  const hasPanel = Boolean(examState.case && examState.case.trim());

  return (
    <main className="h-dvh" style={cssVars({ "--page-color": `var(${config.colorVar})` })}>
      <AgentExtensionSlot agentId={AGENT_ID} />
      <AgentSuggestions config={config} />
      <WorkspaceShell
        hasArtifact={hasPanel}
        panelState={state}
        rail={<NavRail activePath={`/console/${AGENT_ID}`} onNewThread={startNewThread} />}
        chat={
          <ChatSurface
            config={config}
            onSwitchAgent={(id) => router.push(`/console/${id}/${crypto.randomUUID()}`)}
            onOpenArtifact={() => dispatch("open")}
          />
        }
        artifact={
          hasPanel ? (
            <OralBoardsPanel
              state={examState}
              fullscreen={state === "fullscreen"}
              onClose={() => dispatch("close")}
              onToggleFullscreen={() => dispatch("toggle-fullscreen")}
            />
          ) : null
        }
      />
    </main>
  );
}
