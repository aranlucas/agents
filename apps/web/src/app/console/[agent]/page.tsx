"use client";

import { use, useCallback } from "react";
import { notFound, useRouter } from "next/navigation";
import { CopilotKit, useAgent, UseAgentUpdate } from "@copilotkit/react-core/v2";

import { getAgentConfig, isAgentId, type AgentId } from "@/components/chat/agents/registry";
import { AgentExtensionSlot, getAgentExtension } from "@/components/chat/agents/extensions";
import { AgentSuggestions } from "@/components/chat/agents/suggestions";
import { ChatSurface } from "@/components/chat/ChatSurface";
import { ArtifactPanel } from "@/components/chat/ArtifactPanel";
import { NavRail } from "@/components/chat/NavRail";
import { WorkspaceShell, useArtifactPanel } from "@/components/workspace-shell";
import { selectArtifact } from "@/components/chat/artifact";
import { cssVars } from "@/lib/css";

export default function Page({ params }: { params: Promise<{ agent: string }> }) {
  const { agent: raw } = use(params);
  if (!isAgentId(raw)) notFound();
  const agentId: AgentId = raw;
  return (
    <CopilotKit
      runtimeUrl="/api/copilotkit"
      agent={agentId}
      useSingleEndpoint={false}
      enableInspector={process.env.NODE_ENV !== "production"}
      {...getAgentExtension(agentId)?.copilotKitProps}
    >
      <Console key={agentId} agentId={agentId} />
    </CopilotKit>
  );
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

  // "New thread" in the rail: drop the current conversation, clear shared state
  // (so a prior thread's artifact doesn't linger), and start a fresh thread id
  // so the backend session has no carried-over context. Abort any in-flight run
  // first to avoid a dangling request writing into the new thread.
  const startNewThread = useCallback(() => {
    if (!agent) return;
    if (agent.isRunning) agent.abortRun();
    agent.setMessages([]);
    agent.setState({});
    agent.threadId = crypto.randomUUID();
    dispatch("close");
  }, [agent, dispatch]);

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
            onSwitchAgent={(id) => router.push(`/console/${id}`)}
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
