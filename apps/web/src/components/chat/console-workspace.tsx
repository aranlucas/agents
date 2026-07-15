"use client";

import type { ConsoleAgentId } from "@/components/chat/agents/registry";
import { AgentWorkspace } from "@/components/chat/agent-workspace";
import { ExpenseWorkspace } from "@/components/chat/expense-workspace";
import { PresentationWorkspace } from "@/components/chat/presentation-workspace";
import { SpreadsheetWorkspace } from "@/components/chat/spreadsheet-workspace";
import type { AgentSnapshot } from "@/lib/agent-snapshot";

export function ConsoleWorkspace({
  agentId,
  threadId,
  initialSnapshot,
}: {
  agentId: ConsoleAgentId;
  threadId: string;
  initialSnapshot?: AgentSnapshot | null;
}) {
  switch (agentId) {
    case "expense":
      return <ExpenseWorkspace key={`${agentId}:${threadId}`} threadId={threadId} />;
    case "presentation":
      return <PresentationWorkspace key={`${agentId}:${threadId}`} threadId={threadId} />;
    case "spreadsheet":
      return <SpreadsheetWorkspace key={`${agentId}:${threadId}`} threadId={threadId} />;
    default:
      return (
        <AgentWorkspace
          key={`${agentId}:${threadId}`}
          agentId={agentId}
          threadId={threadId}
          initialSnapshot={initialSnapshot}
        />
      );
  }
}
