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

import type { WellnessState, WellnessStatus } from "@agents/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const STATUS_META: Record<
  WellnessStatus,
  { label: string; dotClass: string; chipClass: string }
> = {
  idle: {
    label: "No plan yet",
    dotClass: "bg-[var(--ink-mute)]",
    chipClass: "text-[var(--ink-soft)] bg-[var(--bg-soft)]",
  },
  delegating: {
    label: "Delegating",
    dotClass: "bg-[var(--warning)] animate-pulse",
    chipClass:
      "text-[color-mix(in_srgb,var(--warning)_80%,var(--ink))] bg-[color-mix(in_srgb,var(--warning)_14%,var(--surface))]",
  },
  planning: {
    label: "Planning",
    dotClass: "bg-[var(--accent)] animate-pulse",
    chipClass: "text-[var(--accent-strong)] bg-[var(--accent-soft)]",
  },
  ready: {
    label: "Ready",
    dotClass: "bg-[var(--success)]",
    chipClass: "text-[var(--success)] bg-[var(--success-soft)]",
  },
};

function WellnessPageInner() {
  const { agent } = useAgent({
    agentId: "wellness",
    updates: [UseAgentUpdate.OnStateChanged, UseAgentUpdate.OnRunStatusChanged],
  });

  const state = (agent?.state ?? {}) as WellnessState;
  const status = (state.status ?? "idle") as WellnessStatus;
  const meta = STATUS_META[status] ?? STATUS_META.idle;
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
    <main className="flex min-h-full flex-col">
      <header className="glass sticky top-0 z-20 border-b border-[var(--border-soft)] px-4 pb-4 pt-5 md:px-8">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-emerald-500 shadow-md">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold tracking-tight text-[var(--ink)] md:text-xl">
                Wellness Studio
              </h1>
              <p className="mt-0.5 hidden text-xs text-[var(--ink-mute)] sm:block">
                A2A orchestration for next week's meals and workouts.
              </p>
            </div>
          </div>

          <Badge
            variant="outline"
            className={cn(
              "h-auto gap-2 border-transparent px-3 py-1.5 text-[11px]",
              meta.chipClass,
            )}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${meta.dotClass}`} />
            {isRunning ? "Working..." : meta.label}
          </Badge>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-[1400px] flex-1 gap-4 p-4 md:p-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <SectionCard title="Delegated meals" icon={<Salad className="h-4 w-4" />}>
            <MarkdownOrHint value={state.meal_plan}>
              Grocery output will appear here after wellness delegates meal planning.
            </MarkdownOrHint>
          </SectionCard>

          <SectionCard
            title="Delegated workouts"
            icon={<Dumbbell className="h-4 w-4" />}
          >
            <MarkdownOrHint value={state.workout_plan}>
              Fitness output will appear here after wellness delegates training.
            </MarkdownOrHint>
          </SectionCard>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <SectionCard
            title="Combined weekly plan"
            icon={<CalendarDays className="h-4 w-4" />}
          >
            <MarkdownOrHint value={state.weekly_plan}>
              Ask the agent to coordinate meals and workouts for next week.
            </MarkdownOrHint>
            {isRunning && (
              <div className="mt-3 text-xs text-[var(--accent-strong)]">
                writing...
              </div>
            )}
          </SectionCard>

          {state.review_summary && (
            <SectionCard title="Review" icon={<Sparkles className="h-4 w-4" />}>
              <p className="text-sm text-[var(--ink-soft)]">
                {state.review_summary}
              </p>
            </SectionCard>
          )}
        </div>
      </div>

      <CopilotSidebar
        agentId="wellness"
        defaultOpen={false}
        labels={{
          modalHeaderTitle: "Wellness Planner",
          chatInputPlaceholder: "Coordinate meals, workouts, recovery...",
        }}
      />
    </main>
  );
}

function SectionCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="min-w-0">
      <CardHeader className="flex flex-row items-center gap-2 pb-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent-strong)]">
          {icon}
        </div>
        <CardTitle className="text-sm font-semibold text-[var(--ink)]">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function MarkdownOrHint({
  value,
  children,
}: {
  value?: string;
  children: React.ReactNode;
}) {
  if (!value) {
    return <p className="text-sm text-[var(--ink-mute)]">{children}</p>;
  }

  return (
    <div className="streamdown-markdown text-sm text-[var(--ink-soft)]">
      <Streamdown>{value}</Streamdown>
    </div>
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
