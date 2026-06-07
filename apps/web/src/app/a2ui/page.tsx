"use client";

import React from "react";
import {
  CopilotKit,
  useAgent,
  UseAgentUpdate,
  useConfigureSuggestions,
} from "@copilotkit/react-core/v2";
import {
  Blocks,
  CheckCircle2,
  GalleryVerticalEnd,
  Gauge,
  PanelsTopLeft,
  Sparkles,
  Wand2,
} from "lucide-react";

import { AgentChatPanel, AgentWorkspace } from "@/components/agent-workspace";
import { HeroHeader } from "@/components/hero-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toA2UIState } from "@/lib/agent-state";
import { cssVars } from "@/lib/css";

import type { A2UIStatus } from "@agents/types";

const STATUS_META: Record<A2UIStatus, { label: string }> = {
  idle: { label: "Ready to render" },
  ready: { label: "Surface rendered" },
};

function Metric({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-card)]">
      <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-md bg-[var(--a2ui-soft)] text-[var(--a2ui)]">
        {icon}
      </div>
      <p className="font-mono text-[10px] tracking-[0.18em] text-[var(--ink-mute)] uppercase">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold tracking-tight text-[var(--ink)]">{value}</p>
    </div>
  );
}

function A2UIPageInner() {
  const { agent } = useAgent({
    agentId: "a2ui",
    updates: [UseAgentUpdate.OnStateChanged, UseAgentUpdate.OnRunStatusChanged],
  });

  useConfigureSuggestions({
    suggestions: [
      {
        title: "Launch readiness",
        message:
          "Render the default A2UI Launch Readiness surface. Use catalogId https://a2ui.org/specification/v0_9/basic_catalog.json and v0.9 components with a component field, not type.",
      },
      {
        title: "Product picker",
        message:
          "Render an A2UI product picker for three developer tools with pricing, fit, and a recommendation.",
      },
      {
        title: "Incident dashboard",
        message:
          "Render an A2UI incident dashboard with severity, timeline, owners, and next steps.",
      },
      {
        title: "Trip intake",
        message:
          "Render an A2UI travel intake form with destination, date, budget, and vibe fields.",
      },
    ],
    available: "always",
  });

  const state = toA2UIState(agent?.state);
  const status = state.status ?? "idle";
  const meta = STATUS_META[status] ?? STATUS_META.idle;
  const isRunning = agent?.isRunning ?? false;

  return (
    <main
      className="flex min-h-full flex-col"
      style={cssVars({
        "--page-color": "var(--a2ui)",
        "--page-color-soft": "var(--a2ui-soft)",
        "--page-contrast": "var(--a2ui-contrast)",
      })}
    >
      <HeroHeader
        name="A2UI Studio"
        description="ADK renders declarative interfaces over AG-UI."
        icon={<PanelsTopLeft className="h-5 w-5" />}
        isRunning={isRunning}
        statusLabel={meta.label}
      />

      <AgentWorkspace
        chat={
          <AgentChatPanel
            agentId="a2ui"
            title="A2UI conversation"
            placeholder="Ask for an A2UI dashboard, form, or planner..."
            welcomeMessage="Ask me to render the Launch Readiness A2UI surface."
          />
        }
        artifact={
          <section className="min-w-0 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-panel)]">
            <div className="border-b border-[var(--border)] bg-[var(--surface-soft)] p-5">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-[var(--a2ui-soft)] px-3 py-1 text-xs font-semibold text-[var(--a2ui)]">
                <Sparkles className="h-3.5 w-3.5" />
                A2UI render target
              </div>
              <h1 className="max-w-3xl text-3xl leading-none font-black tracking-tight text-[var(--ink)] md:text-5xl">
                Generated interfaces render inside the conversation.
              </h1>
            </div>

            <div className="grid gap-3 p-5 md:grid-cols-3">
              <Metric label="Transport" value="AG-UI" icon={<Gauge className="h-4 w-4" />} />
              <Metric label="Agent" value="Google ADK" icon={<Wand2 className="h-4 w-4" />} />
              <Metric label="Surface" value="A2UI" icon={<Blocks className="h-4 w-4" />} />
            </div>

            <div className="grid gap-4 p-5 pt-0 md:grid-cols-2">
              <Card
                size="sm"
                className="gap-0 border-[var(--border)] py-0 shadow-[var(--shadow-card)]"
              >
                <CardHeader className="border-b border-[var(--border-soft)] bg-[var(--surface-soft)] px-4 py-3">
                  <CardTitle className="flex items-center gap-2">
                    <GalleryVerticalEnd className="h-4 w-4 text-[var(--a2ui)]" />
                    Verification brief
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 p-4 text-sm text-[var(--ink-soft)]">
                  <p>
                    The CopilotKit runtime injects the A2UI render tool only for the `a2ui` agent.
                  </p>
                  <p>
                    Use the Launch readiness suggestion for the fastest local proof that A2UI is
                    active.
                  </p>
                </CardContent>
              </Card>

              <Card
                size="sm"
                className="gap-0 border-[var(--border)] py-0 shadow-[var(--shadow-card)]"
              >
                <CardHeader className="border-b border-[var(--border-soft)] bg-[var(--surface-soft)] px-4 py-3">
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-[var(--a2ui)]" />
                    Last surface
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4">
                  {state.last_surface ? (
                    <div className="space-y-2">
                      <p className="text-sm font-semibold text-[var(--ink)]">
                        {state.last_surface}
                      </p>
                      <p className="text-sm text-[var(--ink-mute)]">{state.surface_brief}</p>
                    </div>
                  ) : (
                    <p className="text-sm text-[var(--ink-mute)]">
                      No generated surface has been recorded yet.
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          </section>
        }
      />
    </main>
  );
}

export default function A2UIPage() {
  return (
    <CopilotKit
      runtimeUrl="/api/copilotkit"
      agent="a2ui"
      useSingleEndpoint={false}
      enableInspector={process.env.NODE_ENV !== "production"}
      a2ui={{ includeSchema: true }}
    >
      <A2UIPageInner />
    </CopilotKit>
  );
}
