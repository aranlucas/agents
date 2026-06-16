import { WorkspaceShell } from "./workspace-shell";
import { ChatSurface } from "./chat/chat-surface";
import { getAgentConfig } from "./chat/agents/registry";

// Compile-time contract: the shell composes chat/artifact, and ChatSurface
// takes an AgentConfig with the switch/open callbacks. This file failing to
// typecheck is the signal that the console wiring drifted.
export function ContractExample() {
  return (
    <WorkspaceShell
      hasArtifact
      panelState="split"
      chat={
        <ChatSurface
          config={getAgentConfig("travel")}
          onSwitchAgent={() => {}}
          onOpenArtifact={() => {}}
        />
      }
      artifact={<section>artifact</section>}
    />
  );
}
