"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  CopilotChat,
  useAgent,
  UseAgentUpdate,
  useFrontendTool,
  useConfigureSuggestions,
} from "@copilotkit/react-core/v2";
import { z } from "zod";

import { HeroHeader } from "@/components/hero-header";
import { DocumentCanvas, DocStatus } from "@/components/document-canvas";
import {
  PreferencesPanel,
  Preferences,
  DEFAULT_PREFERENCES,
} from "@/components/preferences-panel";
import {
  ApprovalDialog,
  ApprovalRequest,
} from "@/components/approval-dialog";

interface AgentState {
  destination?: string;
  start_date?: string;
  end_date?: string;
  travelers?: number;
  budget_usd?: number;
  headline?: string;
  summary?: string;
  itinerary?: string;
  status?: DocStatus;
  review_summary?: string;
  preferences?: Preferences;
}

const STATUS_VALUES: ReadonlyArray<DocStatus> = [
  "idle",
  "drafting",
  "ready_to_book",
  "booked",
];

function asStatus(s: unknown): DocStatus {
  return STATUS_VALUES.includes(s as DocStatus) ? (s as DocStatus) : "idle";
}

export default function Page() {
  return <CollabStudio />;
}

function CollabStudio() {
  const [preferences, setPreferences] = useState<Preferences>(
    DEFAULT_PREFERENCES,
  );
  const [mobileTab, setMobileTab] = useState<"trip" | "chat">("trip");
  const [pendingApprovals, setPendingApprovals] = useState<ApprovalRequest[]>(
    [],
  );

  const { agent } = useAgent({
    agentId: "default",
    updates: [
      UseAgentUpdate.OnStateChanged,
      UseAgentUpdate.OnRunStatusChanged,
    ],
  });

  const agentState = (agent?.state ?? {}) as AgentState;
  const destination = agentState.destination ?? "";
  const startDate = agentState.start_date ?? "";
  const endDate = agentState.end_date ?? "";
  const travelers = agentState.travelers ?? 0;
  const budgetUsd = agentState.budget_usd ?? 0;
  const headline = agentState.headline ?? "";
  const summary = agentState.summary ?? "";
  const itinerary = agentState.itinerary ?? "";
  const status = asStatus(agentState.status);
  const reviewSummary = agentState.review_summary;
  const isRunning = Boolean(agent?.isRunning);

  // UI → Agent: stream the latest preferences into shared state whenever
  // the user edits a control, but only after we've observed initial state
  // at least once to avoid clobbering server-side defaults.
  const observedOnce = useRef(false);
  useEffect(() => {
    if (!agent) return;
    if (agent.state !== undefined) observedOnce.current = true;
  }, [agent, agent?.state]);

  useEffect(() => {
    if (!agent || !observedOnce.current) return;
    const current = (agent.state ?? {}) as AgentState;
    agent.setState({ ...current, preferences });
  }, [agent, preferences]);

  // Frontend tool — the agent calls this before locking the trip.
  useFrontendTool({
    name: "request_user_approval",
    description:
      "Pause and ask the operator to approve a sensitive trip action " +
      "(book flights, reserve hotels, share itinerary, charge card). " +
      "Returns { approved: boolean, note?: string }.",
    parameters: z.object({
      action: z
        .string()
        .describe("Short, specific description of the action to take."),
      reason: z
        .string()
        .optional()
        .describe(
          "One sentence on why this action is being proposed (cost, " +
            "tradeoff, deadline).",
        ),
    }),
    handler: async ({
      action,
      reason,
    }: {
      action: string;
      reason?: string;
    }) => {
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
        const current = (agent.state ?? {}) as AgentState;
        agent.setState({ ...current, status: "booked" });
      }
      return decision;
    },
  });

  useConfigureSuggestions({
    suggestions: [
      {
        title: "Weekend in Tokyo",
        message:
          "Plan a 3-day weekend in Tokyo focused on food, late November.",
      },
      {
        title: "Family in Lisbon",
        message:
          "Plan a 5-day family trip to Lisbon next summer, kids 7 and 10.",
      },
      {
        title: "Rework Day 2",
        message:
          "Day 2 feels too packed — rework it with a slower morning and one anchor activity in the afternoon.",
      },
      {
        title: "Ready to book?",
        message:
          "If the itinerary looks good, propose locking it in and ask for my approval.",
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
      for (const r of pendingRef.current)
        r.resolve({ approved: false, note: "navigated away" });
    };
  }, []);

  const head = pendingApprovals[0];

  const onDestinationChange = (next: string) => {
    if (!agent) return;
    const current = (agent.state ?? {}) as AgentState;
    agent.setState({ ...current, destination: next });
  };
  const onHeadlineChange = (next: string) => {
    if (!agent) return;
    const current = (agent.state ?? {}) as AgentState;
    agent.setState({ ...current, headline: next });
  };
  const onItineraryChange = (next: string) => {
    if (!agent) return;
    const current = (agent.state ?? {}) as AgentState;
    agent.setState({
      ...current,
      itinerary: next,
      status: next.trim() ? "drafting" : "idle",
    });
  };
  const onReset = () => {
    if (!agent) return;
    const current = (agent.state ?? {}) as AgentState;
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
      status: "idle",
      review_summary: undefined,
    });
  };

  const labels = useMemo(
    () => ({
      title: "Trip planner",
      initial:
        "Hi! Tell me where you'd like to go — or paste a half-baked plan and I'll fill in the rest.",
      chatInputPlaceholder:
        "Plan a trip, rework a day, or ask for tradeoffs…",
    }),
    [],
  );

  return (
    <main className="h-full flex flex-col">
      <HeroHeader isRunning={isRunning} />

      <div className="md:hidden flex border-b border-[var(--border)] bg-[var(--surface)]">
        <button
          onClick={() => setMobileTab("trip")}
          className={`flex-1 py-3 text-xs font-mono tracking-wider uppercase transition ${
            mobileTab === "trip"
              ? "text-[var(--accent-strong)] border-b-2 border-[var(--accent)]"
              : "text-[var(--ink-mute)]"
          }`}
        >
          Trip
        </button>
        <button
          onClick={() => setMobileTab("chat")}
          className={`flex-1 py-3 text-xs font-mono tracking-wider uppercase transition ${
            mobileTab === "chat"
              ? "text-[var(--accent-strong)] border-b-2 border-[var(--accent)]"
              : "text-[var(--ink-mute)]"
          }`}
        >
          Chat
        </button>
      </div>

      <div className="flex-1 min-h-0 grid md:grid-cols-[300px_minmax(0,1fr)_440px] gap-4 p-4 md:p-6 max-w-[1500px] w-full mx-auto">
        <aside
          className={`${
            mobileTab === "trip" ? "block" : "hidden"
          } md:block min-h-0 overflow-y-auto`}
        >
          <PreferencesPanel value={preferences} onChange={setPreferences} />
        </aside>

        <section
          className={`${
            mobileTab === "trip" ? "flex" : "hidden"
          } md:flex flex-col min-h-0`}
        >
          <DocumentCanvas
            destination={destination}
            startDate={startDate}
            endDate={endDate}
            travelers={travelers}
            budgetUsd={budgetUsd}
            headline={headline}
            summary={summary}
            itinerary={itinerary}
            status={status}
            isStreaming={isRunning}
            reviewSummary={reviewSummary}
            onDestinationChange={onDestinationChange}
            onHeadlineChange={onHeadlineChange}
            onItineraryChange={onItineraryChange}
            onReset={onReset}
          />
        </section>

        <aside
          className={`${
            mobileTab === "chat" ? "flex" : "hidden"
          } md:flex flex-col min-h-0 rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-sm overflow-hidden`}
        >
          <CopilotChat
            agentId="default"
            className="flex-1 min-h-0"
            labels={labels}
          />
        </aside>
      </div>

      {head && <ApprovalDialog key={head.id} request={head} />}
    </main>
  );
}
