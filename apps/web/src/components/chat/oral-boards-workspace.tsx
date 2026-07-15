"use client";

import { useCallback } from "react";
import { CopilotSidebar, useAgent, useCopilotKit, UseAgentUpdate } from "@copilotkit/react-core/v2";

import { AlertCircleIcon } from "lucide-react";

import type { OralBoardsState } from "@agents/types";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  SidebarInset,
  SidebarProvider,
  Spinner,
} from "@agents/ui";
import { getAgentConfig } from "@/components/chat/agents/registry";
import { useNewThread } from "@/components/chat/use-new-thread";
import { AgentExtensionSlot } from "@/components/chat/agents/extensions";
import { AppSidebar } from "@/components/chat/app-sidebar";
import { ConsoleTopBar } from "@/components/chat/console-top-bar";
import { OralBoardsErrorBoundary } from "@/components/chat/oral-boards/error-boundary";
import { OralBoardsPanel } from "@/components/chat/oral-boards/oral-boards-panel";
import {
  OralBoardsQuestionProvider,
  useOralBoardsQuestion,
} from "@/lib/copilotkit/oral-boards-question-context";
import { cssVars } from "@/lib/css";
import { useAgentWarmup } from "@/hooks/use-agent-warmup";
import { useGuardedRun } from "@/hooks/use-guarded-run";

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
        <p className="text-sm text-muted-foreground">{loadingStep || "Building your case…"}</p>
      </div>
    );
  }

  if (warmingUp) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <Spinner className="size-8" />
        <p className="text-sm text-muted-foreground">Warming up the search database…</p>
      </div>
    );
  }

  if (warmupError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
        <p className="text-sm text-muted-foreground">
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
      <div className="typeset typeset-site max-w-md text-center">
        <p className="text-xs font-semibold tracking-widest text-indigo-400 uppercase">
          ABPD Oral Clinical Exam
        </p>
        <h2>Practice the oral boards</h2>
        <p className="text-muted-foreground">
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

      <div className="flex w-full max-w-lg flex-col gap-2 text-center">
        <p className="text-xs text-muted-foreground">or focus on a blueprint domain</p>
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

function OralBoardsWorkspaceContent({ threadId }: { threadId: string }) {
  const config = getAgentConfig(AGENT_ID);
  const { pendingInputKind, respondToPendingInput } = useOralBoardsQuestion();
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

  // A rejected run surfaces as an inline banner with Retry instead of leaving
  // the exam hanging on "Waiting for the next question…".
  const { error: runError, run: guardedRun, retry } = useGuardedRun();

  const handleStart = useCallback(
    (content: string) =>
      guardedRun(async () => {
        if (!agent) return;
        agent.addMessage({ id: crypto.randomUUID(), role: "user", content });
        await copilotkit.runAgent({ agent });
      }),
    [agent, copilotkit, guardedRun],
  );

  const handleReady = useCallback(
    () =>
      guardedRun(async () => {
        if (pendingInputKind === "ready" && respondToPendingInput("ready")) return;
        if (!agent) return;
        agent.addMessage({ id: crypto.randomUUID(), role: "user", content: "ready" });
        await copilotkit.runAgent({ agent });
      }),
    [agent, copilotkit, guardedRun, pendingInputKind, respondToPendingInput],
  );

  const handleAnswer = useCallback(
    (text: string) =>
      guardedRun(async () => {
        if (!text.trim()) return;
        if (pendingInputKind === "answer" && respondToPendingInput(text)) return;
        if (!agent) return;
        agent.addMessage({ id: crypto.randomUUID(), role: "user", content: text });
        await copilotkit.runAgent({ agent });
      }),
    [agent, copilotkit, guardedRun, pendingInputKind, respondToPendingInput],
  );

  return (
    <SidebarProvider
      defaultOpen={false}
      className="oral-boards-shell h-dvh overflow-hidden"
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
      <AppSidebar
        activePath={`/console/${AGENT_ID}`}
        agentId={AGENT_ID}
        activeThreadId={threadId}
        onNewThread={startNewThread}
      />
      <SidebarInset className="min-h-0 overflow-hidden">
        <div className="flex h-full flex-col overflow-hidden">
          <ConsoleTopBar agentId={AGENT_ID} threadId={threadId} isRunning={isRunning} />
          {runError && (
            <Alert variant="destructive" className="m-2 shrink-0">
              <AlertCircleIcon />
              <AlertTitle>The examiner ran into a problem</AlertTitle>
              <AlertDescription className="flex w-full items-center justify-between gap-3">
                <span className="min-w-0 truncate">{runError.message}</span>
                <Button type="button" size="xs" variant="outline" onClick={() => void retry()}>
                  Retry
                </Button>
              </AlertDescription>
            </Alert>
          )}
          <div className="min-h-0 flex-1 overflow-hidden">
            {hasPanel ? (
              <OralBoardsErrorBoundary onReset={startNewThread}>
                <OralBoardsPanel
                  state={examState}
                  onClose={startNewThread}
                  onReady={() => void handleReady()}
                  onAnswer={(text) => void handleAnswer(text)}
                  isRunning={isRunning}
                />
              </OralBoardsErrorBoundary>
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

export function OralBoardsWorkspace({ threadId }: { threadId: string }) {
  return (
    <OralBoardsQuestionProvider>
      <OralBoardsWorkspaceContent threadId={threadId} />
    </OralBoardsQuestionProvider>
  );
}
