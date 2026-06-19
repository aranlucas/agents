"use client";

import { useCallback } from "react";
import { CopilotSidebar, useAgent, useCopilotKit, UseAgentUpdate } from "@copilotkit/react-core/v2";

import type { ExpenseState } from "@agents/types";
import { SidebarInset, SidebarProvider } from "@agents/ui";
import { getAgentConfig } from "@/components/chat/agents/registry";
import { AppSidebar } from "@/components/chat/app-sidebar";
import { ExpenseDesk } from "@/components/chat/expense/expense-desk";
import { useNewThread } from "@/components/chat/use-new-thread";
import { cssVars } from "@/lib/css";

const AGENT_ID = "expense" as const;

export function ExpenseWorkspace() {
  const config = getAgentConfig(AGENT_ID);
  const { agent } = useAgent({
    agentId: AGENT_ID,
    updates: [UseAgentUpdate.OnStateChanged, UseAgentUpdate.OnRunStatusChanged],
  });
  const { copilotkit } = useCopilotKit();
  const startNewThread = useNewThread(AGENT_ID);

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
    <SidebarProvider
      defaultOpen={false}
      className="h-dvh overflow-hidden"
      style={cssVars({ "--page-color": `var(${config.colorVar})` })}
    >
      <CopilotSidebar
        defaultOpen={false}
        labels={{
          modalHeaderTitle: "Expense Desk chat",
          chatInputPlaceholder: config.placeholder,
        }}
      />
      <AppSidebar activePath={`/console/${AGENT_ID}`} onNewThread={startNewThread} />
      <SidebarInset className="min-h-0 overflow-hidden">
        <ExpenseDesk
          state={expenseState}
          isRunning={agent?.isRunning ?? false}
          onDecision={handleDecision}
          onPrompt={sendPrompt}
        />
      </SidebarInset>
    </SidebarProvider>
  );
}
