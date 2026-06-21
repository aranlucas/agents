"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CopilotSidebar, useAgent, useCopilotKit, UseAgentUpdate } from "@copilotkit/react-core/v2";

import type { OralBoardsState } from "@agents/types";
import {
  Button,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
  Spinner,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@agents/ui";
import { getAgentConfig } from "@/components/chat/agents/registry";
import { useNewThread } from "@/components/chat/use-new-thread";
import { AgentExtensionSlot } from "@/components/chat/agents/extensions";
import { AppSidebar } from "@/components/chat/app-sidebar";
import { OralBoardsPanel } from "@/components/chat/oral-boards/oral-boards-panel";
import { OralBoardsQuestionProvider } from "@/lib/copilotkit/oral-boards-question-context";
import { useArtifactPanel } from "@/components/workspace-shell";
import { cssVars } from "@/lib/css";
import { useAgentWarmup } from "@/hooks/use-agent-warmup";

type OralBoardsAgentId = "oral-boards" | "oral-boards-v2";

// The two interchangeable examiner backends, surfaced as a toggle at the top of
// the workspace. Both share this UI and shared-state shape; only the orchestration
// differs (prompt-driven vs. ADK graph flow).
const ENGINES: { id: OralBoardsAgentId; label: string }[] = [
  { id: "oral-boards", label: "Prompt-based" },
  { id: "oral-boards-v2", label: "Graph-based" },
];

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

export function OralBoardsWorkspace({ agentId = "oral-boards" }: { agentId?: OralBoardsAgentId }) {
  // `agentId` seeds the active engine; the toggle below switches between the two
  // backends in place without leaving the consolidated /console/oral-boards route.
  const [engine, setEngine] = useState<OralBoardsAgentId>(agentId);
  const config = getAgentConfig(engine);
  const { dispatch } = useArtifactPanel(engine);
  const { agent } = useAgent({
    agentId: engine,
    updates: [UseAgentUpdate.OnStateChanged, UseAgentUpdate.OnRunStatusChanged],
  });
  const { copilotkit } = useCopilotKit();
  const startNewThread = useNewThread(engine);

  const { statuses, isLoading: warmingUp } = useAgentWarmup();
  const warmupError =
    statuses[engine] === "error" && !warmingUp ? new Error("Agent backend is unreachable") : null;

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
      if (!agent || !text.trim()) return;
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
      <OralBoardsQuestionProvider>
        <AgentExtensionSlot agentId={engine} />
        <CopilotSidebar
          defaultOpen={false}
          labels={{
            modalHeaderTitle: "Agent reasoning",
            chatInputPlaceholder: config.placeholder,
          }}
        />
        <AppSidebar activePath={`/console/${agentId}`} onNewThread={startNewThread} />
        <SidebarInset className="min-h-0 overflow-hidden">
          <div className="flex h-full flex-col overflow-hidden">
            <div className="flex shrink-0 items-center gap-3 border-b px-2 py-1.5">
              <SidebarTrigger className="md:hidden" />
              <span className="text-muted-foreground text-[11px] font-medium tracking-wide">
                Examiner engine
              </span>
              <Tabs
                value={engine}
                onValueChange={(value) => {
                  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
                  setEngine(value as OralBoardsAgentId);
                }}
              >
                <TabsList>
                  {ENGINES.map((e) => (
                    <TabsTrigger key={e.id} value={e.id} className="px-3 text-xs">
                      {e.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
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
      </OralBoardsQuestionProvider>
    </SidebarProvider>
  );
}
