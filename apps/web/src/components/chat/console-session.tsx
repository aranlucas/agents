"use client";

import { type ReactNode } from "react";
import { CopilotKit } from "@copilotkit/react-core/v2";

import { getAgentExtension } from "@/components/chat/agents/extensions";
import type { AgentId } from "@/components/chat/agents/registry";

/**
 * The console session provider, shared by every agent's `[thread]/layout.tsx`.
 * It owns the `<CopilotKit>` provider keyed to the agent + the URL's thread id,
 * so the provider persists across in-thread navigation while the page renders
 * the view. The thread id is the durable session key — CopilotKit forwards it
 * to the gateway, where ag-ui-adk maps it onto a persisted ADK session, so a
 * refresh resumes the same conversation.
 *
 * Per-agent provider props (e.g. a2ui's auto-mounted activity renderer) come
 * from the agent's registered `copilotKitProps` extension.
 */
export function ConsoleSession({
  agent,
  thread,
  children,
}: {
  agent: AgentId;
  thread: string;
  children: ReactNode;
}) {
  return (
    <CopilotKit
      runtimeUrl="/api/copilotkit"
      agent={agent}
      threadId={thread}
      useSingleEndpoint={false}
      enableInspector={process.env.NODE_ENV !== "production"}
      {...getAgentExtension(agent)?.copilotKitProps}
    >
      {children}
    </CopilotKit>
  );
}
