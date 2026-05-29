import { AgentChatPanel, AgentWorkspace } from "./agent-workspace";

export function ContractExample() {
  return (
    <AgentWorkspace
      defaultMobilePanel="chat"
      mobileLabels={{
        chat: "Chat",
        artifact: "Output",
        context: "Context",
      }}
      context={<aside>Context</aside>}
      chat={
        <AgentChatPanel
          agentId="travel"
          title="Conversation"
          placeholder="Plan, revise, or finalize..."
          interrupts={<div>Approval needed</div>}
        />
      }
      artifact={<section>Artifact</section>}
    />
  );
}
