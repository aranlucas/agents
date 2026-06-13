"use client";

import { use } from "react";
import { notFound, useRouter } from "next/navigation";
import { CopilotKit, useAgent, UseAgentUpdate } from "@copilotkit/react-core/v2";

import { getAgentConfig, isAgentId, type AgentId } from "@/components/chat/agents/registry";
import { GroceryHooks, TravelHooks } from "@/components/chat/agents/approval";
import { AgentSuggestions } from "@/components/chat/agents/suggestions";
import { ChatSurface } from "@/components/chat/ChatSurface";
import { ArtifactPanel } from "@/components/chat/ArtifactPanel";
import { NavRail } from "@/components/chat/NavRail";
import { WorkspaceShell, useArtifactPanel } from "@/components/workspace-shell";
import { selectArtifact } from "@/components/chat/artifact";
import { cssVars } from "@/lib/css";

// Enables the auto-mounted A2UI activity renderer (the runtime advertises A2UI
// via /info for the a2ui agent). Hoisted so the prop identity stays stable.
const A2UI_CONFIG = {};

export default function Page({ params }: { params: Promise<{ agent: string }> }) {
  const { agent: raw } = use(params);
  if (!isAgentId(raw)) notFound();
  const agentId: AgentId = raw;
  return (
    <CopilotKit
      runtimeUrl="/api/copilotkit"
      agent={agentId}
      useSingleEndpoint={false}
      a2ui={agentId === "a2ui" ? A2UI_CONFIG : undefined}
      enableInspector={process.env.NODE_ENV !== "production"}
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

  return (
    <main className="h-dvh" style={cssVars({ "--page-color": `var(${config.colorVar})` })}>
      {agentId === "travel" && <TravelHooks />}
      {agentId === "grocery" && <GroceryHooks />}
      <AgentSuggestions config={config} />
      <WorkspaceShell
        hasArtifact={Boolean(artifact)}
        panelState={state}
        rail={<NavRail activePath={`/console/${agentId}`} />}
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
