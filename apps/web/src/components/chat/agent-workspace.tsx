"use client";

import { useRouter } from "next/navigation";
import { useAgent, UseAgentUpdate } from "@copilotkit/react-core/v2";

import { SidebarInset, SidebarProvider } from "@agents/ui";
import { getAgentConfig, type AgentId } from "@/components/chat/agents/registry";
import { useNewThread } from "@/components/chat/use-new-thread";
import { AgentExtensionSlot } from "@/components/chat/agents/extensions";
import { AgentSuggestions } from "@/components/chat/agents/suggestions";
import { ChatSurface } from "@/components/chat/chat-surface";
import { ArtifactPanel } from "@/components/chat/artifact-panel";
import { AppSidebar } from "@/components/chat/app-sidebar";
import { WorkspaceShell, useArtifactPanel } from "@/components/workspace-shell";
import { selectArtifact } from "@/components/chat/artifact";
import { cssVars } from "@/lib/css";

/**
 * The default console experience: sidebar + chat + artifact panel, wired to the
 * active agent's CopilotKit session. Every agent's `[thread]/page.tsx` renders
 * this by default; an agent that needs a bespoke surface renders its own
 * component there instead and reuses these primitives as needed.
 *
 * Must render inside a `<ConsoleSession>` provider (the agent's `[thread]`
 * layout supplies it).
 */
export function AgentWorkspace({ agentId, threadId }: { agentId: AgentId; threadId: string }) {
  const router = useRouter();
  const config = getAgentConfig(agentId);
  const { state, dispatch } = useArtifactPanel(agentId);
  const { agent } = useAgent({ agentId, updates: [UseAgentUpdate.OnStateChanged] });
  // CopilotKit agent state is intentionally dynamic; artifact selection validates
  // the fields it needs for the active agent.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const artifact = selectArtifact(agent?.state as Record<string, unknown>, config);

  const startNewThread = useNewThread(agentId);

  return (
    <SidebarProvider
      defaultOpen={false}
      className="h-dvh overflow-hidden"
      style={cssVars({ "--page-color": `var(${config.colorVar})` })}
    >
      <AgentExtensionSlot agentId={agentId} />
      <AgentSuggestions config={config} />
      <AppSidebar activePath={`/console/${agentId}`} onNewThread={startNewThread} />
      <SidebarInset className="min-h-0 overflow-hidden">
        <WorkspaceShell
          hasArtifact={Boolean(artifact)}
          panelState={state}
          chat={
            <ChatSurface
              config={config}
              threadId={threadId}
              onSwitchAgent={(id) => router.push(`/console/${id}/${crypto.randomUUID()}`)}
              onOpenArtifact={() => dispatch("open")}
            />
          }
          artifact={
            artifact ? <ArtifactPanel view={artifact} onClose={() => dispatch("close")} /> : null
          }
        />
      </SidebarInset>
    </SidebarProvider>
  );
}
