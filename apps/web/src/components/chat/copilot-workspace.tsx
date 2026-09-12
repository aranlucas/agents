"use client";

import type { ReactNode } from "react";
import { CopilotSidebar } from "@copilotkit/react-core/v2";

import { SidebarInset, SidebarProvider } from "@agents/ui";
import { getAgentConfig, type AgentId } from "@/components/chat/agents/registry";
import { AppSidebar } from "@/components/chat/app-sidebar";
import { ConsoleTopBar } from "@/components/chat/console-top-bar";
import { useNewThread } from "@/components/chat/use-new-thread";
import { cssVars } from "@/lib/css";

export function CopilotWorkspace({
  agentId,
  threadId,
  isRunning,
  chatTitle,
  children,
}: {
  agentId: AgentId;
  threadId: string;
  isRunning: boolean | undefined;
  chatTitle: string;
  children: ReactNode;
}) {
  const config = getAgentConfig(agentId);
  const startNewThread = useNewThread(agentId);

  return (
    <SidebarProvider
      defaultOpen={false}
      className="h-dvh overflow-hidden"
      style={cssVars({ "--page-color": `var(${config.colorVar})` })}
    >
      <CopilotSidebar
        defaultOpen={false}
        labels={{
          modalHeaderTitle: chatTitle,
          chatInputPlaceholder: config.placeholder,
        }}
      />
      <AppSidebar
        activePath={`/console/${agentId}`}
        agentId={agentId}
        activeThreadId={threadId}
        onNewThread={startNewThread}
      />
      <SidebarInset className="min-h-0 overflow-hidden">
        <ConsoleTopBar agentId={agentId} threadId={threadId} isRunning={isRunning} />
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
