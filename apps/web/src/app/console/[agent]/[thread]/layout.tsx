"use client";

import { use, type ReactNode } from "react";
import { notFound } from "next/navigation";
import { CopilotKit } from "@copilotkit/react-core/v2";

import { isAgentId } from "@/components/chat/agents/registry";
import { getAgentExtension } from "@/components/chat/agents/extensions";

// The console session lives in the layout: it owns the <CopilotKit> provider
// keyed to the URL's agent + thread, so the provider persists across in-thread
// navigation while the page renders the view. The thread id is the durable
// session key — CopilotKit forwards it to the gateway, where ag-ui-adk maps it
// onto a persisted ADK session, so a refresh resumes the same conversation.
export default function ConsoleThreadLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ agent: string; thread: string }>;
}) {
  const { agent, thread } = use(params);
  if (!isAgentId(agent)) notFound();
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
