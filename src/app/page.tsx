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
  document?: string;
  title?: string;
  status?: DocStatus;
  review_summary?: string;
  preferences?: Preferences;
}

const STATUS_VALUES: ReadonlyArray<DocStatus> = [
  "idle",
  "drafting",
  "ready_for_review",
  "published",
];

function asStatus(s: unknown): DocStatus {
  return STATUS_VALUES.includes(s as DocStatus) ? (s as DocStatus) : "idle";
}

export default function Page() {
  return <CollabStudio />;
}

function CollabStudio() {
  const [threadId] = useState(() => crypto.randomUUID());
  const [preferences, setPreferences] = useState<Preferences>(
    DEFAULT_PREFERENCES,
  );
  const [mobileTab, setMobileTab] = useState<"doc" | "chat">("doc");
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
  const docTitle = agentState.title ?? "";
  const docContent = agentState.document ?? "";
  const docStatus = asStatus(agentState.status);
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

  // Frontend tool — the agent calls this to ask the operator to approve
  // a sensitive action (publish, share, delete). The Promise resolves
  // with the user's decision via the ApprovalDialog.
  useFrontendTool({
    name: "request_user_approval",
    description:
      "Pause and ask the operator to approve a sensitive action " +
      "(publish, send, share, delete). Returns { approved: boolean, note?: string }.",
    parameters: z.object({
      action: z
        .string()
        .describe("Short, specific description of the action to take."),
      reason: z
        .string()
        .optional()
        .describe("One sentence on why this action is being proposed."),
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
              setPendingApprovals((q) =>
                q.filter((r) => r.id !== id),
              );
              resolve(d);
            },
          },
        ]);
      });

      if (decision.approved) {
        // Optimistically mark the doc as published so the UI updates
        // immediately even before the agent's follow-up message lands.
        if (agent) {
          const current = (agent.state ?? {}) as AgentState;
          agent.setState({ ...current, status: "published" });
        }
      }
      return decision;
    },
  });

  useConfigureSuggestions({
    suggestions: [
      {
        title: "Draft an announcement",
        message:
          "Draft a short product announcement for our new collaborative editor.",
      },
      {
        title: "Punch up the intro",
        message:
          "Rewrite the first paragraph to be punchier and lead with the user benefit.",
      },
      {
        title: "Summarize for execs",
        message:
          "Take the current document and produce a 3-bullet executive summary at the top.",
      },
      {
        title: "Ready to publish?",
        message:
          "If the draft looks good, propose publishing it and ask for my approval.",
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

  // Two-way sync for inline editing — user types in the canvas, push to
  // shared state so the agent sees it on the next turn.
  const onTitleChange = (next: string) => {
    if (!agent) return;
    const current = (agent.state ?? {}) as AgentState;
    agent.setState({ ...current, title: next });
  };
  const onContentChange = (next: string) => {
    if (!agent) return;
    const current = (agent.state ?? {}) as AgentState;
    agent.setState({
      ...current,
      document: next,
      status: next.trim() ? "drafting" : "idle",
    });
  };
  const onReset = () => {
    if (!agent) return;
    const current = (agent.state ?? {}) as AgentState;
    agent.setState({
      ...current,
      title: "",
      document: "",
      status: "idle",
      review_summary: undefined,
    });
  };

  const labels = useMemo(
    () => ({
      title: "Writing partner",
      initial:
        "Hi! I'm your writing partner. Tell me what to draft, or paste a rough version and I'll polish it.",
      chatInputPlaceholder:
        "Ask me to draft, revise, or improve the document…",
    }),
    [],
  );

  return (
    <main className="h-full flex flex-col">
      <HeroHeader isRunning={isRunning} />

      {/* Mobile tab switcher */}
      <div className="md:hidden flex border-b border-[var(--border)] bg-[var(--surface)]">
        <button
          onClick={() => setMobileTab("doc")}
          className={`flex-1 py-3 text-xs font-mono tracking-wider uppercase transition ${
            mobileTab === "doc"
              ? "text-[var(--accent-strong)] border-b-2 border-[var(--accent)]"
              : "text-[var(--ink-mute)]"
          }`}
        >
          Document
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
        {/* Preferences (UI → Agent) */}
        <aside
          className={`${
            mobileTab === "doc" ? "block" : "hidden"
          } md:block min-h-0 overflow-y-auto`}
        >
          <PreferencesPanel value={preferences} onChange={setPreferences} />
        </aside>

        {/* Document canvas (Agent ↔ UI shared state) */}
        <section
          className={`${
            mobileTab === "doc" ? "flex" : "hidden"
          } md:flex flex-col min-h-0`}
        >
          <DocumentCanvas
            title={docTitle}
            content={docContent}
            status={docStatus}
            isStreaming={isRunning}
            onTitleChange={onTitleChange}
            onContentChange={onContentChange}
            onReset={onReset}
            reviewSummary={reviewSummary}
          />
        </section>

        {/* Chat (agent control surface) */}
        <aside
          className={`${
            mobileTab === "chat" ? "flex" : "hidden"
          } md:flex flex-col min-h-0 rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-sm overflow-hidden`}
        >
          <CopilotChat
            agentId="default"
            threadId={threadId}
            className="flex-1 min-h-0"
            labels={labels}
          />
        </aside>
      </div>

      {head && <ApprovalDialog key={head.id} request={head} />}
    </main>
  );
}
