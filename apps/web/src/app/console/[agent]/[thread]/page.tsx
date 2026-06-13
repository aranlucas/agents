"use client";

import { use, useCallback } from "react";
import { notFound, useRouter } from "next/navigation";
import { useAgent, UseAgentUpdate } from "@copilotkit/react-core/v2";

import { getAgentConfig, isAgentId, type AgentId } from "@/components/chat/agents/registry";
import { AgentExtensionSlot } from "@/components/chat/agents/extensions";
import { AgentSuggestions } from "@/components/chat/agents/suggestions";
import { ChatSurface } from "@/components/chat/ChatSurface";
import { ArtifactPanel } from "@/components/chat/ArtifactPanel";
import { NavRail } from "@/components/chat/NavRail";
import { WorkspaceShell, useArtifactPanel } from "@/components/workspace-shell";
import { selectArtifact } from "@/components/chat/artifact";
import { cssVars } from "@/lib/css";

export default function Page({ params }: { params: Promise<{ agent: string; thread: string }> }) {
  const { agent, thread } = use(params);
  if (!isAgentId(agent)) notFound();
  // Remount per agent+thread so no client state leaks across switches; the
  // <CopilotKit> provider/session lives one level up in layout.tsx.
  return <Console key={`${agent}:${thread}`} agentId={agent} />;
}

function Console({ agentId }: { agentId: AgentId }) {
  const router = useRouter();
  const config = getAgentConfig(agentId);
  const { state, dispatch } = useArtifactPanel(agentId);
  const { agent } = useAgent({ agentId, updates: [UseAgentUpdate.OnStateChanged] });
  // CopilotKit agent state is intentionally dynamic; artifact selection validates
  // the fields it needs for the active agent.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const artifact = selectArtifact(agent?.state as Record<string, unknown>, config);

  // "New thread": route to a fresh thread id. The URL is the source of truth for
  // the active thread, so a new id starts a clean CopilotKit/ADK session and the
  // result is refreshable and shareable. Abort any in-flight run first so a
  // dangling request can't write into the new thread.
  const startNewThread = useCallback(() => {
    if (agent?.isRunning) agent.abortRun();
    router.push(`/console/${agentId}/${crypto.randomUUID()}`);
  }, [agent, agentId, router]);

  return (
    <main className="h-dvh" style={cssVars({ "--page-color": `var(${config.colorVar})` })}>
      <AgentExtensionSlot agentId={agentId} />
      <AgentSuggestions config={config} />
      <WorkspaceShell
        hasArtifact={Boolean(artifact)}
        panelState={state}
        rail={<NavRail activePath={`/console/${agentId}`} onNewThread={startNewThread} />}
        chat={
          <ChatSurface
            config={config}
            onSwitchAgent={(id) => router.push(`/console/${id}/${crypto.randomUUID()}`)}
            onOpenArtifact={() => dispatch("open")}
          />
        }
        artifact={
          artifact ? (
            <ArtifactPanel
              view={artifact}
              fullscreen={state === "fullscreen"}
              onClose={() => dispatch("close")}
              onToggleFullscreen={() => dispatch("toggle-fullscreen")}
            />
          ) : null
        }
      />
    </main>
  );
}
