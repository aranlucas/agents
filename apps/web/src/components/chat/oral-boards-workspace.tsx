"use client";

import { useCallback, useEffect, useRef } from "react";
import { CopilotSidebar, useAgent, useCopilotKit, UseAgentUpdate } from "@copilotkit/react-core/v2";

import type { OralBoardsState } from "@agents/types";
import { Button, SidebarInset, SidebarProvider, SidebarTrigger, Spinner } from "@agents/ui";
import { getAgentConfig } from "@/components/chat/agents/registry";
import { useNewThread } from "@/components/chat/use-new-thread";
import { AgentExtensionSlot } from "@/components/chat/agents/extensions";
import { AppSidebar } from "@/components/chat/app-sidebar";
import { OralBoardsPanel } from "@/components/chat/oral-boards/oral-boards-panel";
import { OralBoardsQuestionProvider } from "@/lib/copilotkit/oral-boards-question-context";
import { useArtifactPanel } from "@/components/workspace-shell";
import { cssVars } from "@/lib/css";
import { useAgentWarmup } from "@/hooks/use-agent-warmup";

const AGENT_ID = "oral-boards" as const;

const TOPICS = [
  { label: "Pulp therapy", message: "Create an oral-board case focused on pulp therapy." },
  { label: "Dental trauma", message: "Give me a staged OCE-style dental trauma case." },
  {
    label: "Early childhood caries",
    message: "Create an oral-board case on early childhood caries.",
  },
  {
    label: "Behavior guidance",
    message: "Create an oral-board case focused on behavior guidance.",
  },
  {
    label: "Sedation & emergencies",
    message: "Create an oral-board case on sedation and managing a medical emergency.",
  },
  {
    label: "Special health care needs",
    message: "Create an oral-board case involving a patient with special health care needs.",
  },
  {
    label: "Oral pathology",
    message: "Create an oral-board case focused on diagnosing a pediatric oral lesion.",
  },
  {
    label: "Space management",
    message: "Create an oral-board case on growth, development, and space management.",
  },
];

function OralBoardsStartPage({
  onStart,
  isGenerating,
  loadingStep,
  warmingUp,
  warmupError,
}: {
  onStart: (message: string) => void;
  isGenerating: boolean;
  loadingStep: string;
  warmingUp: boolean;
  warmupError: Error | null;
}) {
  if (isGenerating) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <Spinner className="size-8" />
        <p className="text-muted-foreground text-sm">{loadingStep || "Building your case…"}</p>
      </div>
    );
  }

  if (warmingUp) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <Spinner className="size-8" />
        <p className="text-muted-foreground text-sm">Warming up the search database…</p>
      </div>
    );
  }

  if (warmupError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
        <p className="text-muted-foreground text-sm">
          Could not connect to the agent backend. You can still start a case — the first question
          may be slower than usual.
        </p>
        <Button size="lg" className="px-10" onClick={() => onStart(TOPICS[0].message)}>
          Start anyway
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 p-8">
      <div className="max-w-md space-y-2.5 text-center">
        <p className="text-[10px] font-semibold tracking-[0.18em] text-indigo-400 uppercase">
          ABPD Oral Clinical Exam
        </p>
        <h2 className="text-xl font-semibold">Practice the oral boards</h2>
        <p className="text-muted-foreground text-sm leading-relaxed">
          Get a grounded clinical vignette, field the examiner&apos;s open-ended questions one at a
          time, then receive cited per-skillset feedback scored on the ABPD 1–3 scale.
        </p>
      </div>

      <Button
        size="lg"
        className="px-10"
        onClick={() => onStart("Run a grounded pediatric dentistry oral-board case.")}
      >
        Start a case
      </Button>

      <div className="w-full max-w-lg space-y-2 text-center">
        <p className="text-muted-foreground text-[11px]">or focus on a blueprint domain</p>
        <div className="flex flex-wrap justify-center gap-2">
          {TOPICS.map((t) => (
            <Button
              key={t.label}
              type="button"
              variant="outline"
              size="xs"
              onClick={() => onStart(t.message)}
              className="rounded-full"
            >
              {t.label}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}

function OralBoardsWorkspaceContent() {
  const config = getAgentConfig(AGENT_ID);
  const { dispatch } = useArtifactPanel(AGENT_ID);
  const { agent } = useAgent({
    agentId: AGENT_ID,
    updates: [UseAgentUpdate.OnStateChanged, UseAgentUpdate.OnRunStatusChanged],
  });
  const { copilotkit } = useCopilotKit();
  const startNewThread = useNewThread(AGENT_ID);

  const { statuses, isLoading: warmingUp } = useAgentWarmup();
  const warmupError =
    statuses[AGENT_ID] === "error" && !warmingUp ? new Error("Agent backend is unreachable") : null;

  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const examState = (agent?.state ?? {}) as OralBoardsState;
  const hasPanel = Boolean(examState.case?.trim());
  const isRunning = agent?.isRunning ?? false;
  const isGenerating = isRunning && !hasPanel;

  // Auto-open the panel the first time a case appears; don't re-open after
  // the user explicitly closes it (would fight the close button).
  const autoOpenedRef = useRef(false);
  useEffect(() => {
    if (hasPanel && !autoOpenedRef.current) {
      autoOpenedRef.current = true;
      dispatch("open");
    }
    if (!hasPanel) autoOpenedRef.current = false;
  }, [hasPanel, dispatch]);

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
      if (!text.trim()) return;
      if (!agent) return;
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      agent.setState({ ...(agent.state as OralBoardsState), status: "feedback" });
      agent.addMessage({ id: crypto.randomUUID(), role: "user", content: text });
      await copilotkit.runAgent({ agent });
    },
    [agent, copilotkit],
  );

  return (
    <SidebarProvider
      defaultOpen={false}
      className="h-dvh overflow-hidden"
      style={cssVars({ "--page-color": `var(${config.colorVar})` })}
    >
      <AgentExtensionSlot agentId={AGENT_ID} />
      <CopilotSidebar
        defaultOpen={false}
        labels={{
          modalHeaderTitle: "Agent reasoning",
          chatInputPlaceholder: config.placeholder,
        }}
      />
      <AppSidebar activePath={`/console/${AGENT_ID}`} onNewThread={startNewThread} />
      <SidebarInset className="min-h-0 overflow-hidden">
        <div className="flex h-full flex-col overflow-hidden">
          <div className="flex shrink-0 items-center gap-3 border-b px-2 py-1.5 md:hidden">
            <SidebarTrigger />
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
            {hasPanel ? (
              <OralBoardsPanel
                state={examState}
                onClose={startNewThread}
                onReady={handleReady}
                onAnswer={(text) => void handleAnswer(text)}
                isRunning={isRunning}
                loadingStep={examState.loading_step ?? ""}
                activeFeedback={examState.active_feedback ?? ""}
                activeIdealResponse={examState.active_ideal_response ?? ""}
              />
            ) : (
              <OralBoardsStartPage
                onStart={(m) => void handleStart(m)}
                isGenerating={isGenerating}
                loadingStep={examState.loading_step ?? ""}
                warmingUp={warmingUp && !hasPanel}
                warmupError={warmupError}
              />
            )}
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

export function OralBoardsWorkspace() {
  return (
    <OralBoardsQuestionProvider>
      <OralBoardsWorkspaceContent />
    </OralBoardsQuestionProvider>
  );
}
