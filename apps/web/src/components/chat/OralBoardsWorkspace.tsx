"use client";

import { useCallback, useEffect } from "react";
import {
  CopilotSidebar,
  useAgent,
  useCopilotKit,
  UseAgentUpdate,
} from "@copilotkit/react-core/v2";

import type { OralBoardsState } from "@agents/types";
import { Button } from "@agents/ui";
import { getAgentConfig } from "@/components/chat/agents/registry";
import { useNewThread } from "@/components/chat/use-new-thread";
import { AgentExtensionSlot } from "@/components/chat/agents/extensions";
import { NavRail } from "@/components/chat/NavRail";
import { OralBoardsPanel } from "@/components/chat/oral-boards/OralBoardsPanel";
import { OralBoardsQuestionProvider } from "@/lib/copilotkit/oral-boards-question-context";
import { useArtifactPanel } from "@/components/workspace-shell";
import { cssVars } from "@/lib/css";

const AGENT_ID = "oral-boards" as const;

const TOPICS = [
  { label: "Pulp therapy", message: "Create an oral-board case focused on pulp therapy." },
  { label: "Dental trauma", message: "Give me a staged OCE-style dental trauma case." },
  { label: "Early childhood caries", message: "Create an oral-board case on early childhood caries." },
  { label: "Behavior guidance", message: "Create an oral-board case focused on behavior guidance." },
];

function OralBoardsStartPage({
  onStart,
  isGenerating,
}: {
  onStart: (message: string) => void;
  isGenerating: boolean;
}) {
  if (isGenerating) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <div className="border-primary size-8 animate-spin rounded-full border-2 border-t-transparent" />
        <p className="text-muted-foreground text-sm">Building your case…</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 p-8">
      <p className="text-muted-foreground text-sm">ABPD Oral Clinical Exam practice</p>
      <Button
        size="lg"
        className="px-10"
        onClick={() => onStart("Run a grounded pediatric dentistry oral-board case.")}
      >
        Start a case
      </Button>
      <div className="flex flex-wrap justify-center gap-2">
        {TOPICS.map((t) => (
          <button
            key={t.label}
            type="button"
            onClick={() => onStart(t.message)}
            className="text-muted-foreground hover:text-foreground rounded-full border px-3 py-1 text-xs transition-colors"
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function OralBoardsWorkspace() {
  const config = getAgentConfig(AGENT_ID);
  const { state, dispatch } = useArtifactPanel(AGENT_ID);
  const { agent } = useAgent({
    agentId: AGENT_ID,
    updates: [UseAgentUpdate.OnStateChanged, UseAgentUpdate.OnRunStatusChanged],
  });
  const { copilotkit } = useCopilotKit();
  const startNewThread = useNewThread(AGENT_ID);

  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const examState = (agent?.state ?? {}) as OralBoardsState;
  const hasPanel = Boolean(examState.case && examState.case.trim());
  const isRunning = agent?.isRunning ?? false;
  const isGenerating = isRunning && !hasPanel;

  useEffect(() => {
    if (hasPanel && state === "closed") dispatch("toggle-fullscreen");
  }, [hasPanel, state, dispatch]);

  const handleStart = useCallback(
    async (content: string) => {
      if (!agent) return;
      agent.addMessage({ id: crypto.randomUUID(), role: "user", content });
      await copilotkit.runAgent({ agent });
    },
    [agent, copilotkit],
  );

  const handleReady = useCallback(() => {
    if (!agent) return;
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    agent.setState({ ...(agent.state as OralBoardsState), status: "questioning" });
    agent.addMessage({ id: crypto.randomUUID(), role: "user", content: "ready" });
    void copilotkit.runAgent({ agent });
  }, [agent, copilotkit]);

  const handleAnswer = useCallback(
    async (text: string) => {
      if (!agent || !text.trim()) return;
      agent.addMessage({ id: crypto.randomUUID(), role: "user", content: text });
      await copilotkit.runAgent({ agent });
    },
    [agent, copilotkit],
  );

  return (
    <main
      className="flex h-dvh overflow-hidden"
      style={cssVars({ "--page-color": `var(${config.colorVar})` })}
    >
      <OralBoardsQuestionProvider>
      <AgentExtensionSlot agentId={AGENT_ID} />
      <CopilotSidebar
        defaultOpen={false}
        labels={{
          modalHeaderTitle: "Agent reasoning",
          chatInputPlaceholder: config.placeholder,
        }}
      />
      <div className="flex-none">
        <NavRail activePath={`/console/${AGENT_ID}`} onNewThread={startNewThread} />
      </div>
      <div className="flex-1 overflow-hidden">
        {hasPanel ? (
          <OralBoardsPanel
            state={examState}
            fullscreen={state === "fullscreen"}
            onClose={() => dispatch("close")}
            onToggleFullscreen={() => dispatch("toggle-fullscreen")}
            onReady={handleReady}
            onAnswer={(text) => void handleAnswer(text)}
            isRunning={isRunning}
          />
        ) : (
          <OralBoardsStartPage
            onStart={(m) => void handleStart(m)}
            isGenerating={isGenerating}
          />
        )}
      </div>
      </OralBoardsQuestionProvider>
    </main>
  );
}