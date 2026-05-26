"use client";

import type React from "react";
import {
  CopilotKit,
  CopilotSidebar,
  useAgent,
  UseAgentUpdate,
  useConfigureSuggestions,
} from "@copilotkit/react-core/v2";
import { CalendarDays, Dumbbell, Salad, Sparkles } from "lucide-react";
import { Streamdown } from "streamdown";

import { HeroHeader } from "@/components/hero-header";

import type { WellnessState, WellnessStatus } from "@agents/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const STATUS_META: Record<WellnessStatus, { label: string }> = {
  idle:       { label: "No plan yet" },
  delegating: { label: "Delegating" },
  planning:   { label: "Planning" },
  ready:      { label: "Ready" },
};

type SourceTheme = "grocery" | "fitness";

const SOURCE_THEME = {
  grocery: {
    headerBg: "bg-[var(--grocery-soft)]",
    iconBg:   "bg-[var(--grocery)]",
    svgColor: "var(--grocery)",
  },
  fitness: {
    headerBg: "bg-[var(--fitness-soft)]",
    iconBg:   "bg-[var(--fitness)]",
    svgColor: "var(--fitness)",
  },
} satisfies Record<SourceTheme, { headerBg: string; iconBg: string; svgColor: string }>;

function OrchestrationFlow({ status }: { status: WellnessStatus }) {
  const isDelegating = status === "delegating";
  const isPlanning   = status === "planning";

  return (
    <div className="flex items-center justify-center border-b border-[var(--border-soft)] bg-[var(--surface)]">
      <div className="flex flex-1 items-center justify-end gap-2 px-6 py-2.5">
        <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--ink-mute)]">
          Grocery
        </span>
        <div className="flex h-6 w-6 items-center justify-center rounded-md text-white bg-[var(--grocery)]">
          <Salad className="h-3 w-3" />
        </div>
        <svg width="32" height="14" viewBox="0 0 32 14" className="shrink-0" style={{ opacity: isDelegating ? 1 : 0.25 }}>
          <line x1="0" y1="7" x2="26" y2="7" stroke="var(--grocery)" strokeWidth="1.5" strokeDasharray={isDelegating ? "4 2" : undefined} />
          <polygon points="26,3 32,7 26,11" fill="var(--grocery)" />
        </svg>
      </div>

      <div className="flex flex-col items-center gap-0.5 px-4 py-2 rounded-xl mx-1 bg-[var(--wellness-soft)]">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg text-white shadow-sm bg-[var(--wellness)]">
          <Sparkles className="h-3.5 w-3.5" />
        </div>
        <span className="font-mono text-[9px] uppercase tracking-widest text-[var(--wellness)]">
          {isPlanning ? "planning…" : "wellness"}
        </span>
      </div>

      <div className="flex flex-1 items-center justify-start gap-2 px-6 py-2.5">
        <svg width="32" height="14" viewBox="0 0 32 14" className="shrink-0 scale-x-[-1]" style={{ opacity: isDelegating ? 1 : 0.25 }}>
          <line x1="0" y1="7" x2="26" y2="7" stroke="var(--fitness)" strokeWidth="1.5" strokeDasharray={isDelegating ? "4 2" : undefined} />
          <polygon points="26,3 32,7 26,11" fill="var(--fitness)" />
        </svg>
        <div className="flex h-6 w-6 items-center justify-center rounded-md text-white bg-[var(--fitness)]">
          <Dumbbell className="h-3 w-3" />
        </div>
        <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--ink-mute)]">
          Fitness
        </span>
      </div>
    </div>
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
      <CardHeader className={`flex flex-row items-center gap-2.5 pb-3 border-b border-[var(--border-soft)] ${t.headerBg}`}>
        <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-white ${t.iconBg}`}>
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
    <Card className="min-w-0 flex flex-col border-[var(--border)]">
      <CardHeader className="flex flex-row items-center gap-2.5 pb-3 border-b border-[var(--border-soft)] bg-[var(--page-color-soft)]">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-white bg-[var(--page-color)]">
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
  const { agent } = useAgent({
    agentId: "wellness",
    updates: [UseAgentUpdate.OnStateChanged, UseAgentUpdate.OnRunStatusChanged],
  });

  const state   = (agent?.state ?? {}) as WellnessState;
  const status  = (state.status ?? "idle") as WellnessStatus;
  const meta    = STATUS_META[status] ?? STATUS_META.idle;
  const isRunning = Boolean(agent?.isRunning);

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
        message:
          "Plan meals and workouts for a busy weekday schedule with more prep on Sunday.",
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
      style={{
        "--page-color":      "var(--wellness)",
        "--page-color-soft": "var(--wellness-soft)",
      } as React.CSSProperties}
    >
      <HeroHeader
        name="Wellness Studio"
        description="A2A orchestration — coordinates grocery and fitness agents for a unified week."
        icon={<Sparkles className="h-5 w-5" />}
        isRunning={isRunning}
        statusLabel={meta.label}
      />

      <OrchestrationFlow status={status} />

      <div className="mx-auto grid w-full max-w-[1400px] flex-1 gap-4 p-4 md:p-6 lg:grid-cols-[340px_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <SourceCard
            title="Meals — from Grocery"
            icon={<Salad className="h-3 w-3" />}
            theme="grocery"
            value={state.meal_plan}
            hint="Grocery output will appear here after wellness delegates meal planning."
          />
          <SourceCard
            title="Workouts — from Fitness"
            icon={<Dumbbell className="h-3 w-3" />}
            theme="fitness"
            value={state.workout_plan}
            hint="Fitness output will appear here after wellness delegates training."
          />
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <PrimaryCard
            title="Combined weekly plan"
            icon={<CalendarDays className="h-3 w-3" />}
            footer={
              isRunning ? (
                <p className="text-xs text-[var(--page-color)]">writing…</p>
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
            <PrimaryCard
              title="Review"
              icon={<Sparkles className="h-3 w-3" />}
            >
              <p className="text-sm text-[var(--ink-soft)]">{state.review_summary}</p>
            </PrimaryCard>
          )}
        </div>
      </div>

      <CopilotSidebar
        agentId="wellness"
        defaultOpen={false}
        labels={{
          modalHeaderTitle:     "Wellness Planner",
          chatInputPlaceholder: "Coordinate meals, workouts, recovery…",
        }}
      />
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
