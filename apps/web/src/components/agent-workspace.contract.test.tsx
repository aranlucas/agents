import { AGENT_CHAT_SLOT_CLASSES, AgentChatPanel, AgentWorkspace } from "./agent-workspace";

export const EXPECTED_CHAT_SLOT_CLASSES = [
  "ai-elements-copilot-chat",
  "ai-elements-conversation",
  "ai-elements-message-view",
  "ai-elements-assistant-message",
  "ai-elements-user-message",
  "ai-elements-prompt-input",
] as const;

const _chatSlotClassContract: typeof EXPECTED_CHAT_SLOT_CLASSES = AGENT_CHAT_SLOT_CLASSES;

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
