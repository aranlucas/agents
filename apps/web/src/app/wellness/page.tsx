"use client";

import React, { useState, useEffect } from "react";
import { useReverification, useUser } from "@clerk/nextjs";
import {
  CopilotKit,
  useAgent,
  UseAgentUpdate,
  useConfigureSuggestions,
} from "@copilotkit/react-core/v2";
import { Activity, CalendarDays, Dumbbell, Salad, ShoppingCart, Sparkles } from "lucide-react";
import { Streamdown } from "streamdown";

import { HeroHeader } from "@/components/hero-header";
import { AgentChatPanel, AgentWorkspace } from "@/components/agent-workspace";
import { useAuthConnection } from "@/lib/use-auth-connection";
import { Button } from "@/components/ui/button";

import type { WellnessState, WellnessStatus } from "@agents/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const KROGER_PROVIDER = "custom_shopping";
const KROGER_STRATEGY = "oauth_custom_shopping";
const STRAVA_STRATEGY = "oauth_custom_strava";

type ConnectStepId = "kroger" | "strava";

type ConnectStep = {
  id: ConnectStepId;
  label: string;
  connectedKey: "kroger_connected" | "strava_connected";
  icon: React.ReactNode;
  iconBg: string;
  description: string;
};

const CONNECT_STEPS: ConnectStep[] = [
  {
    id: "kroger",
    label: "Kroger",
    connectedKey: "kroger_connected",
    icon: <ShoppingCart className="h-6 w-6" />,
    iconBg: "bg-[var(--grocery-soft)]",
    description:
      "The wellness agent delegates meal planning to the grocery agent, which needs your Kroger account.",
  },
  {
    id: "strava",
    label: "Strava",
    connectedKey: "strava_connected",
    icon: <Activity className="h-6 w-6" />,
    iconBg: "bg-[var(--fitness-soft)]",
    description:
      "The wellness agent delegates workout planning to the fitness agent, which uses your Strava activity history.",
  },
];

const STATUS_META: Record<WellnessStatus, { label: string }> = {
  idle: { label: "No plan yet" },
  delegating: { label: "Delegating" },
  planning: { label: "Planning" },
  ready: { label: "Ready" },
};

type SourceTheme = "grocery" | "fitness";

const SOURCE_THEME = {
  grocery: {
    headerBg: "bg-[var(--grocery-soft)]",
    iconBg: "bg-[var(--grocery)]",
    svgColor: "var(--grocery)",
  },
  fitness: {
    headerBg: "bg-[var(--fitness-soft)]",
    iconBg: "bg-[var(--fitness)]",
    svgColor: "var(--fitness)",
  },
} satisfies Record<SourceTheme, { headerBg: string; iconBg: string; svgColor: string }>;

function OrchestrationFlow({ status }: { status: WellnessStatus }) {
  const isDelegating = status === "delegating";
  const isPlanning = status === "planning";

  return (
    <div className="flex items-center justify-center border-b border-[var(--border-soft)] bg-[var(--surface)]">
      <div className="flex flex-1 items-center justify-end gap-2 px-6 py-2.5">
        <span className="font-mono text-[10px] tracking-widest text-[var(--ink-mute)] uppercase">
          Grocery
        </span>
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--grocery)] text-white">
          <Salad className="h-3 w-3" />
        </div>
        <svg
          width="32"
          height="14"
          viewBox="0 0 32 14"
          className="shrink-0"
          style={{ opacity: isDelegating ? 1 : 0.25 }}
        >
          <line
            x1="0"
            y1="7"
            x2="26"
            y2="7"
            stroke="var(--grocery)"
            strokeWidth="1.5"
            strokeDasharray={isDelegating ? "4 2" : undefined}
          />
          <polygon points="26,3 32,7 26,11" fill="var(--grocery)" />
        </svg>
      </div>

      <div className="mx-1 flex flex-col items-center gap-0.5 rounded-xl bg-[var(--wellness-soft)] px-4 py-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--wellness)] text-white shadow-sm">
          <Sparkles className="h-3.5 w-3.5" />
        </div>
        <span className="font-mono text-[9px] tracking-widest text-[var(--wellness)] uppercase">
          {isPlanning ? "planning…" : "wellness"}
        </span>
      </div>

      <div className="flex flex-1 items-center justify-start gap-2 px-6 py-2.5">
        <svg
          width="32"
          height="14"
          viewBox="0 0 32 14"
          className="shrink-0 scale-x-[-1]"
          style={{ opacity: isDelegating ? 1 : 0.25 }}
        >
          <line
            x1="0"
            y1="7"
            x2="26"
            y2="7"
            stroke="var(--fitness)"
            strokeWidth="1.5"
            strokeDasharray={isDelegating ? "4 2" : undefined}
          />
          <polygon points="26,3 32,7 26,11" fill="var(--fitness)" />
        </svg>
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--fitness)] text-white">
          <Dumbbell className="h-3 w-3" />
        </div>
        <span className="font-mono text-[10px] tracking-widest text-[var(--ink-mute)] uppercase">
          Fitness
        </span>
      </div>
    </div>
  );
}

function StepIndicator({
  steps,
  pendingIds,
}: {
  steps: ConnectStep[];
  pendingIds: ConnectStepId[];
}) {
  return (
    <div className="flex items-center justify-center gap-3 py-4">
      {steps.map((step, i) => {
        const isDone = !pendingIds.includes(step.id);
        const isCurrent = pendingIds[0] === step.id;
        const prevDone = i > 0 && !pendingIds.includes(steps[i - 1].id);
        return (
          <React.Fragment key={step.id}>
            {i > 0 && (
              <div
                className={`h-px w-8 ${prevDone ? "bg-[var(--success)]" : "bg-[var(--border)]"}`}
              />
            )}
            <div className="flex flex-col items-center gap-1">
              <div
                className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold ${
                  isDone
                    ? "bg-[var(--success)] text-white"
                    : isCurrent
                      ? "bg-[var(--page-color)] text-white"
                      : "bg-[var(--border)] text-[var(--ink-mute)]"
                }`}
              >
                {isDone ? "✓" : i + 1}
              </div>
              <span
                className={`text-[8px] font-semibold tracking-wider uppercase ${
                  isDone
                    ? "text-[var(--success)]"
                    : isCurrent
                      ? "text-[var(--page-color)]"
                      : "text-[var(--ink-mute)]"
                }`}
              >
                {step.label}
              </span>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

function WellnessConnectGate({
  steps,
  pendingSteps,
  onConnect,
  connectingId,
}: {
  steps: ConnectStep[];
  pendingSteps: ConnectStep[];
  onConnect: (id: ConnectStepId) => void;
  connectingId: ConnectStepId | null;
}) {
  const currentStep = pendingSteps[0];
  const pendingIds = pendingSteps.map((s) => s.id);

  return (
    <>
      <StepIndicator steps={steps} pendingIds={pendingIds} />
      <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
        <div
          className={`flex h-12 w-12 items-center justify-center rounded-2xl text-[var(--page-color)] ${currentStep.iconBg}`}
        >
          {currentStep.icon}
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-[var(--ink)]">Connect {currentStep.label}</h2>
          <p className="max-w-sm text-sm text-[var(--ink-mute)]">{currentStep.description}</p>
        </div>
        <Button
          onClick={() => onConnect(currentStep.id)}
          disabled={connectingId !== null}
          size="lg"
        >
          {connectingId === currentStep.id ? "Connecting…" : `Connect ${currentStep.label}`}
        </Button>
        <p className="text-xs text-[var(--ink-mute)]">
          You&apos;ll be redirected to authorize access, then returned here.
        </p>
      </div>
    </>
  );
}

function SourceCard({
  title,
  icon,
  theme,
  value,
  hint,
}: {
  title: string;
  icon: React.ReactNode;
  theme: SourceTheme;
  value?: string;
  hint: string;
}) {
  const t = SOURCE_THEME[theme];
  return (
    <Card className="min-w-0 overflow-hidden border-[var(--border)]">
      <CardHeader
        className={`flex flex-row items-center gap-2.5 border-b border-[var(--border-soft)] pb-3 ${t.headerBg}`}
      >
        <div
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-white ${t.iconBg}`}
        >
          {icon}
        </div>
        <CardTitle className="text-sm font-semibold text-[var(--ink)]">{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-4">
        {value ? (
          <div className="streamdown-markdown text-sm text-[var(--ink-soft)]">
            <Streamdown>{value}</Streamdown>
          </div>
        ) : (
          <p className="text-sm text-[var(--ink-mute)]">{hint}</p>
        )}
      </CardContent>
    </Card>
  );
}

function PrimaryCard({
  title,
  icon,
  children,
  footer,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <Card className="flex min-w-0 flex-col border-[var(--border)]">
      <CardHeader className="flex flex-row items-center gap-2.5 border-b border-[var(--border-soft)] bg-[var(--page-color-soft)] pb-3">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[var(--page-color)] text-white">
          {icon}
        </div>
        <CardTitle className="text-sm font-semibold text-[var(--ink)]">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 p-4">{children}</CardContent>
      {footer && <div className="px-4 pb-4">{footer}</div>}
    </Card>
  );
}

function WellnessPageInner() {
  const { user, isLoaded } = useUser();
  const [connectingId, setConnectingId] = useState<ConnectStepId | null>(null);

  const connectKroger = useReverification(async () => {
    if (!user) return;
    const existing = user.externalAccounts.find(({ provider }) => provider === KROGER_PROVIDER);
    const account = existing
      ? await existing.reauthorize({ redirectUrl: window.location.href })
      : await user.createExternalAccount({
          strategy: KROGER_STRATEGY,
          redirectUrl: window.location.href,
        });
    const redirectUrl = account.verification?.externalVerificationRedirectURL?.href;
    if (redirectUrl) window.location.assign(redirectUrl);
  });

  const connectStrava = useReverification(async () => {
    if (!user) return;
    const existing = user.externalAccounts.find(
      ({ provider }) => provider === "custom_strava" || String(provider) === STRAVA_STRATEGY,
    );
    const account = existing
      ? await existing.reauthorize({ redirectUrl: window.location.href })
      : await user.createExternalAccount({
          strategy: STRAVA_STRATEGY,
          redirectUrl: window.location.href,
        });
    const redirectUrl = account.verification?.externalVerificationRedirectURL?.href;
    if (redirectUrl) window.location.assign(redirectUrl);
  });

  const { agent } = useAgent({
    agentId: "wellness",
    updates: [UseAgentUpdate.OnStateChanged, UseAgentUpdate.OnRunStatusChanged],
  });

  const krogerConnection = useAuthConnection({
    endpoint: "/api/mcp/token",
    enabled: Boolean(isLoaded && user),
    queryKey: ["auth-connection", "kroger"],
  });

  const stravaConnection = useAuthConnection({
    endpoint: "/api/strava/token",
    enabled: Boolean(isLoaded && user),
    queryKey: ["auth-connection", "strava"],
  });

  useEffect(() => {
    if (!agent || !krogerConnection.data) return;
    const current = (agent.state ?? {}) as WellnessState;
    if (current.kroger_connected === krogerConnection.data.connected) return;
    agent.setState({
      ...current,
      kroger_connected: krogerConnection.data.connected,
    });
  }, [agent, krogerConnection.data]);

  useEffect(() => {
    if (!agent || !stravaConnection.data) return;
    const current = (agent.state ?? {}) as WellnessState;
    if (current.strava_connected === stravaConnection.data.connected) return;
    agent.setState({
      ...current,
      strava_connected: stravaConnection.data.connected,
    });
  }, [agent, stravaConnection.data]);

  const state = (agent?.state ?? {}) as WellnessState;
  const status = (state.status ?? "idle") as WellnessStatus;
  const meta = STATUS_META[status] ?? STATUS_META.idle;
  const isRunning = Boolean(agent?.isRunning);

  const pendingSteps = CONNECT_STEPS.filter((s) => !state[s.connectedKey]);

  const handleConnect = async (id: ConnectStepId) => {
    if (!user || connectingId !== null) return;
    setConnectingId(id);
    try {
      if (id === "kroger") await connectKroger();
      else await connectStrava();
    } catch (err) {
      console.error("Connect failed:", err);
      setConnectingId(null);
    }
  };

  useConfigureSuggestions({
    suggestions: [
      {
        title: "Plan next week",
        message:
          "Ask grocery and fitness to plan my next week, then combine meals and workouts into one schedule.",
      },
      {
        title: "High protein",
        message:
          "Create a high-protein week with three strength sessions and two easier cardio days.",
      },
      {
        title: "Busy weekdays",
        message: "Plan meals and workouts for a busy weekday schedule with more prep on Sunday.",
      },
      {
        title: "Recovery week",
        message:
          "Coordinate a recovery-focused week with simple meals, mobility, and low-intensity training.",
      },
    ],
    available: "always",
  });

  return (
    <main
      className="flex min-h-full flex-col"
      style={
        {
          "--page-color": "var(--wellness)",
          "--page-color-soft": "var(--wellness-soft)",
        } as React.CSSProperties
      }
    >
      <HeroHeader
        name="Wellness Studio"
        description="A2A orchestration — coordinates grocery and fitness agents for a unified week."
        icon={<Sparkles className="h-5 w-5" />}
        isRunning={isRunning}
        statusLabel={meta.label}
      />

      <OrchestrationFlow status={status} />

      {pendingSteps.length > 0 ? (
        <WellnessConnectGate
          steps={CONNECT_STEPS}
          pendingSteps={pendingSteps}
          onConnect={handleConnect}
          connectingId={connectingId}
        />
      ) : (
        <AgentWorkspace
          context={
            <div className="flex min-w-0 flex-col gap-4">
              <SourceCard
                title="Meals - from Grocery"
                icon={<Salad className="h-3 w-3" />}
                theme="grocery"
                value={state.meal_plan}
                hint="Grocery output will appear here after wellness delegates meal planning."
              />
              <SourceCard
                title="Workouts - from Fitness"
                icon={<Dumbbell className="h-3 w-3" />}
                theme="fitness"
                value={state.workout_plan}
                hint="Fitness output will appear here after wellness delegates training."
              />
            </div>
          }
          chat={
            <AgentChatPanel
              agentId="wellness"
              title="Wellness conversation"
              placeholder="Coordinate meals, workouts, recovery..."
              welcomeMessage="Ask me to delegate to grocery and fitness, then merge their work into one practical week."
            />
          }
          artifact={
            <div className="flex min-w-0 flex-col gap-4">
              <PrimaryCard
                title="Combined weekly plan"
                icon={<CalendarDays className="h-3 w-3" />}
                footer={
                  isRunning ? (
                    <p className="text-xs text-[var(--page-color)]">writing...</p>
                  ) : undefined
                }
              >
                {state.weekly_plan ? (
                  <div className="streamdown-markdown text-sm text-[var(--ink-soft)]">
                    <Streamdown>{state.weekly_plan}</Streamdown>
                  </div>
                ) : (
                  <p className="text-sm text-[var(--ink-mute)]">
                    Ask the agent to coordinate meals and workouts for next week.
                  </p>
                )}
              </PrimaryCard>

              {state.review_summary && (
                <PrimaryCard title="Review" icon={<Sparkles className="h-3 w-3" />}>
                  <p className="text-sm text-[var(--ink-soft)]">{state.review_summary}</p>
                </PrimaryCard>
              )}
            </div>
          }
        />
      )}
    </main>
  );
}

export default function WellnessPage() {
  return (
    <CopilotKit
      runtimeUrl="/api/copilotkit"
      agent="wellness"
      useSingleEndpoint={false}
      enableInspector={process.env.NODE_ENV !== "production"}
    >
      <WellnessPageInner />
    </CopilotKit>
  );
}
