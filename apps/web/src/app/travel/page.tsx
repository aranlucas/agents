"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  CopilotKit,
  useAgent,
  UseAgentUpdate,
  useFrontendTool,
  useConfigureSuggestions,
} from "@copilotkit/react-core/v2";
import { z } from "zod";
import { Plane } from "lucide-react";

import type { DocStatus, TripState } from "@agents/types";

import { HeroHeader } from "@/components/hero-header";
import { AgentChatPanel, AgentWorkspace } from "@/components/agent-workspace";
import { DocumentCanvas } from "@/components/document-canvas";
import { PreferencesPanel } from "@/components/preferences-panel";
import { ApprovalCard, ApprovalRequest } from "@/components/approval-dialog";

const STATUS_VALUES: ReadonlyArray<DocStatus> = ["idle", "drafting", "ready_to_book", "booked"];

function asStatus(s: unknown): DocStatus {
  return STATUS_VALUES.includes(s as DocStatus) ? (s as DocStatus) : "idle";
}

export default function Page() {
  return (
    <CopilotKit
      runtimeUrl="/api/copilotkit"
      agent="travel"
      useSingleEndpoint={false}
      enableInspector={process.env.NODE_ENV !== "production"}
    >
      <TripStudio />
    </CopilotKit>
  );
}

function TripStudio() {
  const [pendingApprovals, setPendingApprovals] = useState<ApprovalRequest[]>([]);

  const { agent } = useAgent({
    agentId: "travel",
    updates: [UseAgentUpdate.OnStateChanged, UseAgentUpdate.OnRunStatusChanged],
  });

  const agentState = (agent?.state ?? {}) as TripState;
  const destination = agentState.destination ?? "";
  const startDate = agentState.start_date ?? "";
  const endDate = agentState.end_date ?? "";
  const travelers = agentState.travelers ?? 0;
  const budgetUsd = agentState.budget_usd ?? 0;
  const headline = agentState.headline ?? "";
  const summary = agentState.summary ?? "";
  const itinerary = agentState.itinerary ?? "";
  const flights = agentState.flights ?? "";
  const status = asStatus(agentState.status);
  const reviewSummary = agentState.review_summary;
  const isRunning = Boolean(agent?.isRunning);

  useFrontendTool({
    name: "request_user_approval",
    description:
      "Pause and ask the operator to approve a sensitive trip action " +
      "(book flights, reserve hotels, share itinerary, charge card). " +
      "Returns { approved: boolean, note?: string }.",
    parameters: z.object({
      action: z.string().describe("Short, specific description of the action to take."),
      reason: z
        .string()
        .optional()
        .describe(
          "One sentence on why this action is being proposed (cost, " + "tradeoff, deadline).",
        ),
    }),
    handler: async ({ action, reason }: { action: string; reason?: string }) => {
      const id = crypto.randomUUID();
      const decision = await new Promise<{
        approved: boolean;
        note?: string;
      }>((resolve) => {
        setPendingApprovals((prev) => [
          ...prev,
          {
            id,
            action,
            reason: reason ?? "",
            resolve: (d) => {
              setPendingApprovals((q) => q.filter((r) => r.id !== id));
              resolve(d);
            },
          },
        ]);
      });

      if (decision.approved && agent) {
        const current = (agent.state ?? {}) as TripState;
        agent.setState({ ...current, status: "booked" });
      }
      return decision;
    },
  });

  useConfigureSuggestions({
    suggestions: [
      {
        title: "Weekend in Tokyo",
        message: "Plan a 3-day weekend in Tokyo focused on food, late November.",
      },
      {
        title: "Family in Lisbon",
        message: "Plan a 5-day family trip to Lisbon next summer, kids 7 and 10.",
      },
      {
        title: "Rework Day 2",
        message:
          "Day 2 feels too packed — rework it with a slower morning and one anchor activity in the afternoon.",
      },
      {
        title: "Ready to book?",
        message: "If the itinerary looks good, propose locking it in and ask for my approval.",
      },
    ],
    available: "always",
  });

  // Cleanup any pending approval promises if the user unmounts mid-flow.
  const pendingRef = useRef<ApprovalRequest[]>([]);
  useEffect(() => {
    pendingRef.current = pendingApprovals;
  }, [pendingApprovals]);
  useEffect(() => {
    return () => {
      for (const r of pendingRef.current) r.resolve({ approved: false, note: "navigated away" });
    };
  }, []);

  const head = pendingApprovals[0];

  const onDestinationChange = (next: string) => {
    if (!agent) return;
    const current = (agent.state ?? {}) as TripState;
    agent.setState({ ...current, destination: next });
  };
  const onHeadlineChange = (next: string) => {
    if (!agent) return;
    const current = (agent.state ?? {}) as TripState;
    agent.setState({ ...current, headline: next });
  };
  const onItineraryChange = (next: string) => {
    if (!agent) return;
    const current = (agent.state ?? {}) as TripState;
    agent.setState({
      ...current,
      itinerary: next,
      status: next.trim() ? "drafting" : "idle",
    });
  };
  const onReset = () => {
    if (!agent) return;
    const current = (agent.state ?? {}) as TripState;
    agent.setState({
      ...current,
      destination: "",
      start_date: "",
      end_date: "",
      travelers: 0,
      budget_usd: 0,
      headline: "",
      summary: "",
      itinerary: "",
      flights: "",
      status: "idle",
      review_summary: undefined,
    });
  };

  return (
    <main
      className="flex min-h-full flex-col"
      style={
        {
          "--page-color": "var(--travel)",
          "--page-color-soft": "var(--travel-soft)",
          "--page-contrast": "var(--travel-contrast)",
        } as React.CSSProperties
      }
    >
      <HeroHeader
        name="Trip Studio"
        description="Co-plan trips with an AI partner in real time."
        icon={<Plane className="h-5 w-5" />}
        isRunning={isRunning}
      />

      <AgentWorkspace
        context={<PreferencesPanel />}
        chat={
          <AgentChatPanel
            agentId="travel"
            title="Trip conversation"
            placeholder="Plan a trip, rework a day, or ask for tradeoffs..."
            welcomeMessage="Tell me where you want to go, what dates you have, and what kind of trip you want."
            interrupts={head ? <ApprovalCard request={head} /> : undefined}
          />
        }
        artifact={
          <div className="flex min-h-[60vh] flex-col md:min-h-0">
            <DocumentCanvas
              destination={destination}
              startDate={startDate}
              endDate={endDate}
              travelers={travelers}
              budgetUsd={budgetUsd}
              headline={headline}
              summary={summary}
              itinerary={itinerary}
              flights={flights}
              status={status}
              isStreaming={isRunning}
              reviewSummary={reviewSummary}
              onDestinationChange={onDestinationChange}
              onHeadlineChange={onHeadlineChange}
              onItineraryChange={onItineraryChange}
              onReset={onReset}
            />
          </div>
        }
      />
    </main>
  );
}
