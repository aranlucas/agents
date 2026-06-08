"use client";

import { Fragment, useCallback } from "react";
import {
  useAgent,
  useCopilotKit,
  useDefaultRenderTool,
  useRenderToolCall,
  UseAgentUpdate,
} from "@copilotkit/react-core/v2";
import { SparklesIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { Reasoning, ReasoningContent, ReasoningTrigger } from "@/components/ai-elements/reasoning";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";

import type { AgentConfig, AgentId } from "./agents/registry";
import { toRenderItems, type AguiMessage, type AguiToolCall } from "./messages";
import { selectArtifact } from "./artifact";
import { toToolState } from "./tool-adapter";
import { AgentSelector } from "./AgentSelector";

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

  const messages = (agent?.messages ?? []) as AguiMessage[];
  const items = toRenderItems(messages);
  const isRunning = agent?.isRunning ?? false;
  const artifact = selectArtifact(agent?.state as Record<string, unknown>, config);

  // Pair each tool call with its result message (role: "tool") so the resolver
  // can render the completed state instead of a perpetual "Pending".
  const toolMessages = new Map<string, AguiMessage>();
  for (const m of messages) {
    if (m.role === "tool" && m.toolCallId) toolMessages.set(m.toolCallId, m);
  }

  // The resolver's toolCall/toolMessage types are CopilotKit-internal; our Agui*
  // are the structural runtime shapes. Cast at this single boundary.
  const renderTC = (tc: AguiToolCall) =>
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
        <ConversationContent className="mx-auto w-full max-w-[760px]">
          {items.length === 0 ? (
            <ConversationEmptyState
              icon={<SparklesIcon className="size-5" />}
              title={`${config.label} is ready`}
              description={config.welcome ?? config.placeholder}
            />
          ) : (
            items.map((item) => {
              if (item.kind === "user") {
                return (
                  <Message key={item.id} from="user">
                    <MessageContent>{item.text}</MessageContent>
                  </Message>
                );
              }
              const last = item === items[items.length - 1];
              return (
                <Message key={item.id} from="assistant">
                  <MessageContent>
                    {item.reasoning && (
                      <Reasoning isStreaming={last && isRunning && !item.text.trim()}>
                        <ReasoningTrigger />
                        <ReasoningContent>{item.reasoning}</ReasoningContent>
                      </Reasoning>
                    )}
                    {item.toolCalls.map((tc) => (
                      <Fragment key={tc.id}>{renderTC(tc)}</Fragment>
                    ))}
                    {item.text.trim() && <MessageResponse>{item.text}</MessageResponse>}
                    {last && artifact && (
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
        <div className="mx-auto w-full max-w-[760px]">
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
              <PromptInputSubmit status={isRunning ? "streaming" : "ready"} onStop={stop} />
            </PromptInputFooter>
          </PromptInput>
        </div>
      </div>
    </div>
  );
}
