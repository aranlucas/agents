"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useReverification, useUser } from "@clerk/nextjs";
import {
  CopilotKit,
  useAgent,
  UseAgentUpdate,
  useConfigureSuggestions,
} from "@copilotkit/react-core/v2";
import { Activity, Dumbbell, Mountain, RefreshCw } from "lucide-react";
import { AgentChatPanel, AgentWorkspace } from "@/components/agent-workspace";
import { HeroHeader } from "@/components/hero-header";
import { Streamdown } from "streamdown";

import type { FitnessActivity, FitnessState, FitnessStatus } from "@agents/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuthConnection } from "@/lib/use-auth-connection";

const STRAVA_STRATEGY = "oauth_custom_strava";

const STATUS_META: Record<FitnessStatus, { label: string; dotClass: string; chipClass: string }> = {
  idle: {
    label: "No plan yet",
    dotClass: "bg-[var(--ink-mute)]",
    chipClass: "text-[var(--ink-soft)] bg-[var(--bg-soft)]",
  },
  syncing: {
    label: "Syncing",
    dotClass: "bg-[var(--accent)] animate-pulse",
    chipClass: "text-[var(--accent-strong)] bg-[var(--accent-soft)]",
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

function StravaGate({ onConnect, connecting }: { onConnect: () => void; connecting: boolean }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--page-color-soft,var(--accent-soft))]">
        <Activity className="h-6 w-6 text-[var(--page-color,var(--accent-strong))]" />
      </div>
      <div className="space-y-2">
        <h2 className="text-xl font-semibold text-[var(--ink)]">Connect Strava</h2>
        <p className="max-w-sm text-sm text-[var(--ink-mute)]">
          The fitness agent uses your recent activity history to adapt weekly training, recovery,
          and mountain objective prep.
        </p>
      </div>
      <Button onClick={onConnect} disabled={connecting} size="lg">
        {connecting ? "Connecting..." : "Connect Strava"}
      </Button>
    </div>
  );
}

function FitnessPageInner() {
  const { user, isLoaded } = useUser();
  const [connecting, setConnecting] = useState(false);

  const connectStrava = useReverification(async () => {
    if (!user) return;
    const existingAccount = user.externalAccounts.find(
      ({ provider }) => provider === "custom_strava" || String(provider) === STRAVA_STRATEGY,
    );

    const account = existingAccount
      ? await existingAccount.reauthorize({ redirectUrl: window.location.href })
      : await user.createExternalAccount({
          strategy: STRAVA_STRATEGY,
          redirectUrl: window.location.href,
        });
    const redirectUrl = account.verification?.externalVerificationRedirectURL?.href;
    if (redirectUrl) window.location.assign(redirectUrl);
  });

  const { agent } = useAgent({
    agentId: "fitness",
    updates: [UseAgentUpdate.OnStateChanged, UseAgentUpdate.OnRunStatusChanged],
  });
  const stravaConnection = useAuthConnection({
    endpoint: "/api/strava/token",
    enabled: Boolean(isLoaded && user),
    queryKey: ["auth-connection", "strava"],
  });

  const state = (agent?.state ?? {}) as FitnessState;
  const activities = state.activities ?? [];
  const trainingPlan = state.training_plan ?? "";
  const objectiveResearch = state.objective_research ?? "";
  const status = (state.status ?? "idle") as FitnessStatus;
  const meta = STATUS_META[status] ?? STATUS_META.idle;
  const isRunning = Boolean(agent?.isRunning);
  const stravaConnected = state.strava_connected ?? false;

  useConfigureSuggestions({
    suggestions: [
      {
        title: "Plan next week",
        message: "Sync my Strava activities and plan next week of training.",
      },
      {
        title: "Gym + mobility",
        message: "Add two gym sessions and daily mobility to this week.",
      },
      {
        title: "Mountain objective",
        message:
          "Research Mount Shasta conditions and adapt my training week toward that objective.",
      },
      {
        title: "Recovery focus",
        message: "Adapt this week around recovery while keeping my long-term mountain goal moving.",
      },
    ],
    available: "always",
  });

  useEffect(() => {
    if (!agent || !stravaConnection.data) return;

    const current = (agent.state ?? {}) as FitnessState;
    if (current.strava_connected === stravaConnection.data.connected) return;

    agent.setState({
      ...current,
      strava_connected: stravaConnection.data.connected,
    });
  }, [agent, stravaConnection.data]);

  const handleConnect = async () => {
    if (!user || connecting) return;
    setConnecting(true);
    try {
      await connectStrava();
    } catch (err) {
      console.error("Connect failed:", err);
      setConnecting(false);
    }
  };

  const totals = useMemo(() => summarizeActivities(activities), [activities]);

  return (
    <main
      className="flex min-h-full flex-col"
      style={
        {
          "--page-color": "var(--fitness)",
          "--page-color-soft": "var(--fitness-soft)",
        } as React.CSSProperties
      }
    >
      <HeroHeader
        name="Fitness Studio"
        description="Weekly training from Strava history and mountain objectives."
        icon={<Mountain className="h-5 w-5" />}
        isRunning={isRunning}
        statusLabel={meta.label}
      />

      {!stravaConnected ? (
        <StravaGate onConnect={handleConnect} connecting={connecting} />
      ) : (
        <AgentWorkspace
          context={
            <div className="flex min-w-0 flex-col gap-4">
              <SummaryCard totals={totals} syncedAt={state.activities_synced_at} />
              <ActivitiesCard activities={activities} />
            </div>
          }
          chat={
            <AgentChatPanel
              agentId="fitness"
              title="Fitness conversation"
              placeholder="Plan training, sync Strava, research objectives..."
              welcomeMessage="Ask me to sync recent activity, plan the week, or adapt training around a mountain objective."
            />
          }
          artifact={
            <div className="flex min-w-0 flex-col gap-4">
              <PlanCard plan={trainingPlan} isStreaming={isRunning} />
              <ResearchCard research={objectiveResearch} />
            </div>
          }
        />
      )}
    </main>
  );
}

function summarizeActivities(activities: FitnessActivity[]) {
  return activities.reduce(
    (acc, activity) => {
      acc.count += 1;
      acc.distanceKm += (activity.distance_m ?? 0) / 1000;
      acc.hours += (activity.moving_time_s ?? 0) / 3600;
      acc.elevationM += activity.total_elevation_gain_m ?? 0;
      return acc;
    },
    { count: 0, distanceKm: 0, hours: 0, elevationM: 0 },
  );
}

function SectionCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card size="sm" className="gap-0 py-0">
      <CardHeader className="flex-row items-center gap-2 border-b border-[var(--border-soft)] bg-[var(--surface-soft)] px-4 py-3">
        {icon && <span className="text-[var(--page-color,var(--ink-mute))]">{icon}</span>}
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-4">{children}</CardContent>
    </Card>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-[var(--ink-mute)]">{children}</p>;
}

function SummaryCard({
  totals,
  syncedAt,
}: {
  totals: {
    count: number;
    distanceKm: number;
    hours: number;
    elevationM: number;
  };
  syncedAt?: string;
}) {
  return (
    <SectionCard title="Recent load" icon={<RefreshCw className="h-4 w-4" />}>
      <div className="grid grid-cols-2 gap-3">
        <Metric label="Activities" value={totals.count.toString()} />
        <Metric label="Distance" value={`${totals.distanceKm.toFixed(1)} km`} />
        <Metric label="Time" value={`${totals.hours.toFixed(1)} h`} />
        <Metric label="Gain" value={`${Math.round(totals.elevationM)} m`} />
      </div>
      {syncedAt && (
        <p className="mt-3 text-xs text-[var(--ink-mute)]">
          Synced {new Date(syncedAt).toLocaleString()}
        </p>
      )}
    </SectionCard>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[var(--border-soft)] bg-[var(--surface-soft)] p-3">
      <div className="text-[11px] text-[var(--ink-mute)] uppercase">{label}</div>
      <div className="mt-1 font-mono text-lg font-semibold text-[var(--ink)]">{value}</div>
    </div>
  );
}

function ActivitiesCard({ activities }: { activities: FitnessActivity[] }) {
  return (
    <SectionCard title="Activities" icon={<Activity className="h-4 w-4" />}>
      {activities.length === 0 ? (
        <EmptyHint>Ask the agent to sync recent Strava activities.</EmptyHint>
      ) : (
        <ul className="divide-y divide-[var(--border-soft)]">
          {activities.slice(0, 8).map((activity) => (
            <li key={activity.id} className="py-2 first:pt-0 last:pb-0">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate font-medium text-[var(--ink)]">
                  {activity.name}
                </span>
                <span className="shrink-0 text-xs text-[var(--ink-mute)]">
                  {activity.sport_type ?? "Activity"}
                </span>
              </div>
              <div className="mt-1 flex gap-3 text-xs text-[var(--ink-mute)]">
                {activity.distance_m !== undefined && (
                  <span>{(activity.distance_m / 1000).toFixed(1)} km</span>
                )}
                {activity.total_elevation_gain_m !== undefined && (
                  <span>{Math.round(activity.total_elevation_gain_m)} m gain</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

function PlanCard({ plan, isStreaming }: { plan: string; isStreaming: boolean }) {
  return (
    <SectionCard title="Weekly plan" icon={<Dumbbell className="h-4 w-4" />}>
      {plan ? (
        <div className="streamdown-markdown text-sm text-[var(--ink-soft)]">
          <Streamdown>{plan}</Streamdown>
        </div>
      ) : (
        <EmptyHint>Ask the agent to build a week from your recent training.</EmptyHint>
      )}
      {isStreaming && <div className="mt-3 text-xs text-[var(--accent-strong)]">writing...</div>}
    </SectionCard>
  );
}

function ResearchCard({ research }: { research: string }) {
  if (!research) return null;
  return (
    <SectionCard title="Objective research" icon={<Mountain className="h-4 w-4" />}>
      <div className="streamdown-markdown text-sm text-[var(--ink-soft)]">
        <Streamdown>{research}</Streamdown>
      </div>
    </SectionCard>
  );
}

export default function FitnessPage() {
  return (
    <CopilotKit
      runtimeUrl="/api/copilotkit"
      agent="fitness"
      useSingleEndpoint={false}
      enableInspector={process.env.NODE_ENV !== "production"}
    >
      <FitnessPageInner />
    </CopilotKit>
  );
}
