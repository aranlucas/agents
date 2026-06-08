"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { CopilotKit, useAgent, UseAgentUpdate } from "@copilotkit/react-core/v2";

import { getAgentConfig, isAgentId, type AgentId } from "@/components/chat/agents/registry";
import { TravelHooks } from "@/components/chat/agents/travel";
import { ChatSurface } from "@/components/chat/ChatSurface";
import { ArtifactPanel } from "@/components/chat/ArtifactPanel";
import { NavRail } from "@/components/chat/NavRail";
import { WorkspaceShell, useArtifactPanel } from "@/components/workspace-shell";
import { selectArtifact } from "@/components/chat/artifact";
import { cssVars } from "@/lib/css";

export default function Page({ params }: { params: Promise<{ agent: string }> }) {
  const { agent: raw } = use(params);
  const agentId: AgentId = isAgentId(raw) ? raw : "travel";
  return (
    <CopilotKit runtimeUrl="/api/copilotkit" agent={agentId} useSingleEndpoint={false}>
      <Console key={agentId} agentId={agentId} />
    </CopilotKit>
  );
}

function Console({ agentId }: { agentId: AgentId }) {
  const router = useRouter();
  const config = getAgentConfig(agentId);
  const { state, dispatch } = useArtifactPanel(agentId);
  const { agent } = useAgent({ agentId, updates: [UseAgentUpdate.OnStateChanged] });
  const artifact = selectArtifact(agent?.state as Record<string, unknown>, config);

  return (
    <main className="h-screen" style={cssVars({ "--page-color": `var(${config.colorVar})` })}>
      {agentId === "travel" && <TravelHooks />}
      <WorkspaceShell
        hasArtifact={Boolean(artifact)}
        panelState={state}
        rail={<NavRail />}
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
