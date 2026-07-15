"use client";

import { Fragment, memo, useCallback, useEffect, useRef, useState } from "react";
import {
  useAgent,
  useCopilotKit,
  useDefaultRenderTool,
  useRenderActivityMessage,
  useRenderToolCall,
  useSuggestions,
  UseAgentUpdate,
} from "@copilotkit/react-core/v2";
import { FileIcon, PaperclipIcon, SparklesIcon, XIcon } from "lucide-react";

import { Button, Streamdown } from "@agents/ui";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@agents/ui/components/empty";
import { Message, MessageContent } from "@agents/ui/components/message";
import { Bubble, BubbleContent } from "@agents/ui/components/bubble";
import {
  MessageScrollerProvider,
  MessageScroller,
  MessageScrollerViewport,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerButton,
} from "@agents/ui/components/message-scroller";
import { Marker, MarkerContent } from "@agents/ui/components/marker";
import { Suggestion, Suggestions } from "@agents/ui/components/ai-elements/suggestion";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@agents/ui/components/ai-elements/reasoning";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@agents/ui/components/ai-elements/tool";
import {
  PromptInput,
  PromptInputActionAddAttachments,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuTrigger,
  PromptInputBody,
  PromptInputFooter,
  PromptInputHeader,
  PromptInputProvider,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  usePromptInputAttachments,
  type PromptInputMessage,
} from "@agents/ui/components/ai-elements/prompt-input";
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
} from "@agents/ui/components/attachment";

import type { AgentConfig, AgentId } from "./agents/registry";
import { toRenderItems, type AguiMessage, type AguiToolCall } from "./messages";
import { selectArtifact } from "./artifact";
import { toToolState } from "./tool-adapter";
import { AgentSelector } from "./agent-selector";
import { ConnectNotice } from "./connect-notice";
import { TranscribeButton } from "./transcribe-button";
import { useRequiredConnections } from "@/hooks/use-required-connections";

type SuggestionIdentity = { title: string; message: string };

function suggestionKey(suggestion: SuggestionIdentity): string {
  return JSON.stringify([suggestion.title, suggestion.message]);
}

function uniqueSuggestions<T extends SuggestionIdentity>(suggestions: readonly T[]): T[] {
  const seen = new Set<string>();
  return suggestions.filter((suggestion) => {
    const key = suggestionKey(suggestion);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const AssistantText = memo(
  ({ children }: { children: string }) => (
    <Streamdown className="[&>*:first-child]:mt-0 [&>*:last-child]:mb-0">{children}</Streamdown>
  ),
  (prev, next) => prev.children === next.children,
);
AssistantText.displayName = "AssistantText";

function StagedAttachments() {
  const { files, remove } = usePromptInputAttachments();
  if (files.length === 0) return null;
  return (
    <PromptInputHeader>
      <AttachmentGroup>
        {files.map((file) => {
          const isImage = file.mediaType?.startsWith("image/");
          return (
            <Attachment key={file.id} size="sm" state="done">
              <AttachmentMedia variant={isImage ? "image" : "icon"}>
                {isImage ? (
                  // oxlint-disable-next-line next/no-img-element -- blob/data URLs cannot be optimized by next/image
                  <img src={file.url} alt={file.filename ?? "attachment"} />
                ) : (
                  <FileIcon />
                )}
              </AttachmentMedia>
              <AttachmentContent>
                <AttachmentTitle>{file.filename ?? "File"}</AttachmentTitle>
              </AttachmentContent>
              <AttachmentActions>
                <AttachmentAction onClick={() => remove(file.id)}>
                  <XIcon />
                </AttachmentAction>
              </AttachmentActions>
            </Attachment>
          );
        })}
      </AttachmentGroup>
    </PromptInputHeader>
  );
}

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

function isConnectedRuntimeStatus(status: unknown) {
  return status === "connected";
}

// activeRunCompletionPromise is private on AbstractAgent, so a type predicate
// that redeclares it intersects the agent with a conflicting private member and
// collapses to `never`. Read it through Reflect instead, matching CopilotKit's
// runtime behavior without claiming it is part of the public agent type.
export function getRunCompletionPromise(value: unknown): Promise<unknown> | undefined {
  if (typeof value !== "object" || value === null) return undefined;

  const candidate = Reflect.get(value, "activeRunCompletionPromise");
  if (
    (typeof candidate !== "object" && typeof candidate !== "function") ||
    candidate === null ||
    typeof Reflect.get(candidate, "then") !== "function"
  ) {
    return undefined;
  }

  return Promise.resolve(candidate);
}

export function ChatSurface({
  config,
  threadId,
  onSwitchAgent,
  onOpenArtifact,
}: {
  config: AgentConfig;
  threadId: string;
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
  const visibleSuggestions = uniqueSuggestions(suggestions);
  const connections = useRequiredConnections(config.id);
  const gated = !connections.isLoading && connections.isMissing;
  const connectedAgentRef = useRef<typeof agent | null>(null);
  const isRuntimeConnected = isConnectedRuntimeStatus(copilotkit.runtimeConnectionStatus);
  // Track which agent instance has finished connecting. Deriving isAgentConnected
  // by comparing to the current agent avoids a synchronous setState in the
  // effect body (no-adjust-state-on-prop-change).
  const [connectedAgent, setConnectedAgent] = useState<typeof agent | null>(null);
  const isAgentConnected = connectedAgent === agent;

  useEffect(() => {
    let detached = false;
    const connectAbortController = new AbortController();

    if (!agent || connectedAgentRef.current === agent || !isRuntimeConnected) {
      return undefined;
    }

    agent.threadId = threadId;
    if ("abortController" in agent) {
      agent.abortController = connectAbortController;
    }
    connectedAgentRef.current = agent;
    void copilotkit
      .connectAgent({ agent })
      .catch((error: unknown) => {
        if (detached) return;
        connectedAgentRef.current = null;
        if (error instanceof Error && error.name === "AGUIConnectNotImplementedError") return;
        console.error("ChatSurface: connectAgent failed", error);
      })
      .finally(() => {
        if (detached) return;
        // Mirror CopilotKit prebuilt: delay one frame so any loaded messages
        // paint before suggestions appear, avoiding a layout jump.
        const raf =
          typeof requestAnimationFrame === "function"
            ? requestAnimationFrame
            : (cb: () => void) => setTimeout(cb, 16);
        raf(() => {
          if (!detached) setConnectedAgent(agent);
        });
      });

    return () => {
      detached = true;
      connectAbortController.abort();
      connectedAgentRef.current = null;
      setConnectedAgent(null);
      void agent.detachActiveRun?.();
    };
  }, [agent, copilotkit, isRuntimeConnected, threadId]);

  // CopilotKit's public agent message type is looser than the AG-UI runtime
  // shape this renderer consumes; keep that cast at the integration boundary.
  const messages = (agent?.messages ?? []) as AguiMessage[];
  const items = toRenderItems(messages);
  const isRunning = agent?.isRunning ?? false;
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const artifact = selectArtifact(agent?.state as Record<string, unknown>, config);

  // The artifact button hangs off the most recent assistant turn.
  let lastAssistantId: string | undefined;
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (item.kind === "assistant") {
      lastAssistantId = item.id;
      break;
    }
  }

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
    async (text: string, files: PromptInputMessage["files"] = []) => {
      const trimmed = text.trim();
      if (!agent || !trimmed || !isAgentConnected) return;
      // Mirror CopilotKit prebuilt: wait for any in-flight run before queuing.
      const runCompletion = agent.isRunning ? getRunCompletionPromise(agent) : undefined;
      if (runCompletion) {
        try {
          await runCompletion;
        } catch (error) {
          console.error("ChatSurface: in-flight run rejected while queuing send", error);
        }
      }
      const content =
        files.length > 0
          ? [
              trimmed,
              ...files.map((f) =>
                f.mediaType?.startsWith("image/")
                  ? `![${f.filename ?? "image"}](${f.url ?? ""})`
                  : `[Attached: ${f.filename ?? "file"}]`,
              ),
            ].join("\n\n")
          : trimmed;
      agent.addMessage({ id: crypto.randomUUID(), role: "user", content });
      void copilotkit.runAgent({ agent });
    },
    [agent, copilotkit, isAgentConnected],
  );

  const stop = useCallback(() => {
    if (!agent) return;
    try {
      copilotkit.stopAgent({ agent });
    } catch (error) {
      console.error("ChatSurface: stopAgent failed", error);
      try {
        agent.abortRun();
      } catch (abortError) {
        console.error("ChatSurface: abortRun fallback failed", abortError);
      }
    }
  }, [agent, copilotkit]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ToolRendererRegistration />
      <MessageScrollerProvider autoScroll defaultScrollPosition="last-anchor">
        <MessageScroller className="flex-1">
          <MessageScrollerViewport>
            <MessageScrollerContent aria-busy={isRunning} className="mx-auto w-full max-w-190 p-4">
              {items.length === 0 && isAgentConnected ? (
                <Empty className="border-none">
                  <EmptyMedia>
                    <SparklesIcon className="size-5 text-muted-foreground" />
                  </EmptyMedia>
                  <EmptyHeader>
                    <EmptyTitle>{config.label} is ready</EmptyTitle>
                    <EmptyDescription>{config.welcome ?? config.placeholder}</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <>
                  {items.length > 0 && (
                    <MessageScrollerItem key="conversation-start">
                      <Marker variant="separator">
                        <MarkerContent>{config.label}</MarkerContent>
                      </Marker>
                    </MessageScrollerItem>
                  )}
                  {items.map((item) => {
                    if (item.kind === "activity") {
                      return (
                        <MessageScrollerItem key={item.id} messageId={item.id}>
                          {/* oxlint-disable-next-line typescript/no-unsafe-type-assertion */}
                          {activityMessage(item.message as never)}
                        </MessageScrollerItem>
                      );
                    }
                    if (item.kind === "user") {
                      return (
                        <MessageScrollerItem key={item.id} messageId={item.id} scrollAnchor>
                          <Message align="end">
                            <MessageContent>
                              <Bubble variant="secondary" align="end">
                                <BubbleContent>{item.text}</BubbleContent>
                              </Bubble>
                            </MessageContent>
                          </Message>
                        </MessageScrollerItem>
                      );
                    }
                    const last = item === items.at(-1);
                    if (item.kind === "reasoning") {
                      return (
                        <MessageScrollerItem key={item.id} messageId={item.id}>
                          <Reasoning defaultOpen={false} isStreaming={last && isRunning}>
                            <ReasoningTrigger />
                            <ReasoningContent>{item.text}</ReasoningContent>
                          </Reasoning>
                        </MessageScrollerItem>
                      );
                    }
                    return (
                      <MessageScrollerItem key={item.id} messageId={item.id}>
                        <Message align="start">
                          <MessageContent>
                            {item.toolCalls.map((tc) => (
                              <Fragment key={tc.id}>{toolCallContent(tc)}</Fragment>
                            ))}
                            {item.text.trim() && (
                              <Bubble variant="ghost" align="start">
                                <BubbleContent>
                                  <AssistantText>{item.text}</AssistantText>
                                </BubbleContent>
                              </Bubble>
                            )}
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
                      </MessageScrollerItem>
                    );
                  })}
                </>
              )}
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton />
        </MessageScroller>
      </MessageScrollerProvider>

      <div className="px-4 pb-safe-bottom">
        <div className="mx-auto w-full max-w-190">
          {gated ? (
            <ConnectNotice agentLabel={config.label} />
          ) : (
            <>
              {isAgentConnected && !isRunning && visibleSuggestions.length > 0 && (
                <Suggestions className="mb-2">
                  {visibleSuggestions.map((s) => (
                    <Suggestion
                      key={suggestionKey(s)}
                      suggestion={s.title}
                      onClick={() => void send(s.message)}
                    />
                  ))}
                </Suggestions>
              )}
              <PromptInputProvider>
                <PromptInput
                  onSubmit={(message: PromptInputMessage) => {
                    void send(message.text ?? "", message.files);
                  }}
                >
                  <StagedAttachments />
                  <PromptInputBody>
                    <PromptInputTextarea placeholder={config.placeholder} />
                  </PromptInputBody>
                  <PromptInputFooter>
                    <PromptInputTools>
                      <AgentSelector active={config.id} onSelect={onSwitchAgent} />
                      <PromptInputActionMenu>
                        <PromptInputActionMenuTrigger>
                          <PaperclipIcon />
                        </PromptInputActionMenuTrigger>
                        <PromptInputActionMenuContent>
                          <PromptInputActionAddAttachments />
                        </PromptInputActionMenuContent>
                      </PromptInputActionMenu>
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
