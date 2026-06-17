"use client";

import { Fragment, useCallback } from "react";
import {
  useAgent,
  useCopilotKit,
  useDefaultRenderTool,
  useRenderActivityMessage,
  useRenderToolCall,
  useSuggestions,
  UseAgentUpdate,
} from "@copilotkit/react-core/v2";
import { SparklesIcon } from "lucide-react";

import {
  Button,
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
  Message,
  MessageContent,
  MessageResponse,
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputProvider,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
  Suggestion,
  Suggestions,
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
  type PromptInputMessage,
} from "@agents/ui";

import type { AgentConfig, AgentId } from "./agents/registry";
import { toRenderItems, type AguiMessage, type AguiToolCall } from "./messages";
import { selectArtifact } from "./artifact";
import { toToolState } from "./tool-adapter";
import { AgentSelector } from "./agent-selector";
import { ConnectNotice } from "./connect-notice";
import { TranscribeButton } from "./transcribe-button";
import { useRequiredConnections } from "@/hooks/use-required-connections";

// Registers the wildcard tool renderer that `useRenderToolCall()` resolves to
// for our custom message list. Maps CopilotKit status -> ai-elements Tool state.
function ToolRendererRegistration() {
  useDefaultRenderTool({
    render: ({ name, status, parameters, result }) => (
      <Tool>
        <ToolHeader type="dynamic-tool" toolName={name} state={toToolState(status)} />
        <ToolContent>
          <ToolInput input={parameters} />
          {status === "complete" && <ToolOutput output={result} errorText={undefined} />}
        </ToolContent>
      </Tool>
    ),
  });
  return null;
}

export function ChatSurface({
  config,
  onSwitchAgent,
  onOpenArtifact,
}: {
  config: AgentConfig;
  onSwitchAgent: (id: AgentId) => void;
  onOpenArtifact: () => void;
}) {
  const { agent } = useAgent({
    agentId: config.id,
    updates: [
      UseAgentUpdate.OnMessagesChanged,
      UseAgentUpdate.OnRunStatusChanged,
      UseAgentUpdate.OnStateChanged,
    ],
  });
  const { copilotkit } = useCopilotKit();
  const renderToolCall = useRenderToolCall();
  const { renderActivityMessage: activityMessage } = useRenderActivityMessage();
  const { suggestions } = useSuggestions({ agentId: config.id });
  const connections = useRequiredConnections(config.id);
  const gated = !connections.isLoading && connections.missing.length > 0;

  // CopilotKit's public agent message type is looser than the AG-UI runtime
  // shape this renderer consumes; keep that cast at the integration boundary.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const messages = (agent?.messages ?? []) as AguiMessage[];
  const items = toRenderItems(messages);
  const isRunning = agent?.isRunning ?? false;
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const artifact = selectArtifact(agent?.state as Record<string, unknown>, config);

  // The artifact button hangs off the most recent assistant turn.
  const lastAssistantId = items.findLast((i) => i.kind === "assistant")?.id;

  // Pair each tool call with its result message (role: "tool") so the resolver
  // can render the completed state instead of a perpetual "Pending".
  const toolMessages = new Map<string, AguiMessage>();
  for (const m of messages) {
    if (m.role === "tool" && m.toolCallId) toolMessages.set(m.toolCallId, m);
  }

  // The resolver's toolCall/toolMessage types are CopilotKit-internal; our Agui*
  // are the structural runtime shapes. Cast at this single boundary.
  const toolCallContent = (tc: AguiToolCall) =>
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    renderToolCall({ toolCall: tc as never, toolMessage: toolMessages.get(tc.id) as never });

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!agent || !trimmed) return;
      agent.addMessage({ id: crypto.randomUUID(), role: "user", content: trimmed });
      void copilotkit.runAgent({ agent });
    },
    [agent, copilotkit],
  );

  const stop = useCallback(() => {
    if (agent) copilotkit.stopAgent({ agent });
  }, [agent, copilotkit]);

  return (
    <div className="flex h-full flex-col">
      <ToolRendererRegistration />
      <Conversation className="flex-1">
        <ConversationContent className="mx-auto w-full max-w-190">
          {items.length === 0 ? (
            <ConversationEmptyState
              icon={<SparklesIcon className="size-5" />}
              title={`${config.label} is ready`}
              description={config.welcome ?? config.placeholder}
            />
          ) : (
            items.map((item) => {
              if (item.kind === "activity") {
                return (
                  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
                  <Fragment key={item.id}>{activityMessage(item.message as never)}</Fragment>
                );
              }
              if (item.kind === "user") {
                return (
                  <Message key={item.id} from="user">
                    <MessageContent>{item.text}</MessageContent>
                  </Message>
                );
              }
              const last = item === items.at(-1);
              if (item.kind === "reasoning") {
                // Standalone "Thinking" block, rendered in message order. It is
                // streaming only while it is the final item and the agent is running.
                return (
                  <Reasoning key={item.id} defaultOpen={false} isStreaming={last && isRunning}>
                    <ReasoningTrigger />
                    <ReasoningContent>{item.text}</ReasoningContent>
                  </Reasoning>
                );
              }
              return (
                <Message key={item.id} from="assistant">
                  <MessageContent>
                    {item.toolCalls.map((tc) => (
                      <Fragment key={tc.id}>{toolCallContent(tc)}</Fragment>
                    ))}
                    {item.text.trim() && <MessageResponse>{item.text}</MessageResponse>}
                    {item.id === lastAssistantId && artifact && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="mt-1 w-fit gap-2"
                        onClick={onOpenArtifact}
                      >
                        ▤ Open {artifact.title}
                      </Button>
                    )}
                  </MessageContent>
                </Message>
              );
            })
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto w-full max-w-190">
          {gated ? (
            <ConnectNotice agentLabel={config.label} missing={connections.missing} />
          ) : (
            <>
              {!isRunning && suggestions.length > 0 && (
                <Suggestions className="mb-2">
                  {suggestions.map((s) => (
                    <Suggestion
                      key={s.title}
                      suggestion={s.title}
                      onClick={() => send(s.message)}
                    />
                  ))}
                </Suggestions>
              )}
              <PromptInputProvider>
                <PromptInput
                  onSubmit={(message: PromptInputMessage) => {
                    send(message.text ?? "");
                  }}
                >
                  <PromptInputBody>
                    <PromptInputTextarea placeholder={config.placeholder} />
                  </PromptInputBody>
                  <PromptInputFooter>
                    <PromptInputTools>
                      <AgentSelector active={config.id} onSelect={onSwitchAgent} />
                    </PromptInputTools>
                    <PromptInputTools>
                      <TranscribeButton />
                      <PromptInputSubmit status={isRunning ? "streaming" : "ready"} onStop={stop} />
                    </PromptInputTools>
                  </PromptInputFooter>
                </PromptInput>
              </PromptInputProvider>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
