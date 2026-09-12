"use client";

import { useCallback } from "react";
import { useAgent, useCopilotKit, UseAgentUpdate } from "@copilotkit/react-core/v2";

import type { ExpenseState } from "@agents/types";
import { ExpenseDesk } from "@/components/chat/expense/expense-desk";

import { CopilotWorkspace } from "@/components/chat/copilot-workspace";

const AGENT_ID = "expense" as const;

export function ExpenseWorkspace({ threadId }: { threadId: string }) {
  const { agent } = useAgent({
    agentId: AGENT_ID,
    updates: [UseAgentUpdate.OnStateChanged, UseAgentUpdate.OnRunStatusChanged],
  });
  const { copilotkit } = useCopilotKit();

  // CopilotKit agent state is dynamic at the protocol boundary.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const expenseState = (agent?.state ?? {}) as ExpenseState;

  const sendPrompt = useCallback(
    async (content: string) => {
      if (!agent) return;
      agent.addMessage({ id: crypto.randomUUID(), role: "user", content });
      await copilotkit.runAgent({ agent });
    },
    [agent, copilotkit],
  );

  const handleDecision = useCallback(
    async (expenseId: string, decision: "approved" | "rejected") => {
      await sendPrompt(`${decision === "approved" ? "Approve" : "Reject"} expense ${expenseId}.`);
    },
    [sendPrompt],
  );

  return (
    <CopilotWorkspace
      agentId={AGENT_ID}
      threadId={threadId}
      isRunning={agent?.isRunning}
      chatTitle="Expense Desk chat"
    >
      <div className="min-h-0 flex-1">
        <ExpenseDesk
          state={expenseState}
          isRunning={agent?.isRunning ?? false}
          onDecision={handleDecision}
          onPrompt={sendPrompt}
        />
      </div>
    </CopilotWorkspace>
  );
}
