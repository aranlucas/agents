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
import { ArrowRightIcon, FileIcon, PaperclipIcon, XIcon } from "lucide-react";

import { Button, Streamdown } from "@agents/ui";
import { cn } from "@agents/ui/lib/utils";
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
  useMessageScroller,
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
import { AgentIcon } from "@/components/agent-icon";
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

function SubmittedMessageScroll({
  messageId,
  onScrollStarted,
}: {
  messageId: string | null;
  onScrollStarted: (messageId: string) => void;
}) {
  const { scrollToMessage } = useMessageScroller();

  useEffect(() => {
    if (!messageId) return undefined;

    const scheduleFrame =
      typeof requestAnimationFrame === "function"
        ? requestAnimationFrame
        : (callback: FrameRequestCallback) => setTimeout(callback, 16);
    const cancelFrame =
      typeof cancelAnimationFrame === "function" ? cancelAnimationFrame : clearTimeout;
    let frame: number;
    let attempts = 0;

    const scroll = () => {
      attempts += 1;
      const reducedMotion =
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
      const started = scrollToMessage(messageId, {
        align: "start",
        behavior: reducedMotion ? "auto" : "smooth",
        scrollMargin: 0,
      });

      if (started) {
        onScrollStarted(messageId);
      } else if (attempts < 3) {
        frame = scheduleFrame(scroll);
      }
    };

    frame = scheduleFrame(scroll);
    return () => cancelFrame(frame);
  }, [messageId, onScrollStarted, scrollToMessage]);

  return null;
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

function dismissKeyboard() {
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
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
  const [connectionFailure, setConnectionFailure] = useState<{
    agent: typeof agent;
    message: string;
  } | null>(null);
  const [connectionAttempt, setConnectionAttempt] = useState(0);
  const [submittedMessageId, setSubmittedMessageId] = useState<string | null>(null);
  const isAgentConnected = connectedAgent === agent;
  const currentConnectionFailure =
    connectionFailure?.agent === agent ? connectionFailure.message : null;

  const handleSubmissionScrollStarted = useCallback((messageId: string) => {
    setSubmittedMessageId((currentMessageId) =>
      currentMessageId === messageId ? null : currentMessageId,
    );
  }, []);

  useEffect(() => {
    let detached = false;
    const connectAbortController = new AbortController();

    if (!agent || connectedAgentRef.current === agent || !isRuntimeConnected) {
      return undefined;
    }

    // CopilotKit's imperative connection API requires configuring the mutable
    // agent instance returned by useAgent before passing it to connectAgent.
    // oxlint-disable-next-line react/immutability
    agent.threadId = threadId;
    if ("abortController" in agent) {
      agent.abortController = connectAbortController;
    }
    connectedAgentRef.current = agent;
    const markConnected = () => {
      if (detached) return;
      // Mirror CopilotKit prebuilt: delay one frame so any loaded messages
      // paint before suggestions appear, avoiding a layout jump.
      const raf =
        typeof requestAnimationFrame === "function"
          ? requestAnimationFrame
          : (cb: () => void) => setTimeout(cb, 16);
      raf(() => {
        if (!detached) {
          setConnectionFailure(null);
          setConnectedAgent(agent);
        }
      });
    };
    void copilotkit
      .connectAgent({ agent })
      .then(markConnected)
      .catch((error: unknown) => {
        if (detached) return;
        if (error instanceof Error && error.name === "AGUIConnectNotImplementedError") {
          markConnected();
          return;
        }
        connectedAgentRef.current = null;
        setConnectionFailure({
          agent,
          message: `Couldn't connect to ${config.label}. Your draft is safe.`,
        });
        console.error("ChatSurface: connectAgent failed", error);
      });

    return () => {
      detached = true;
      connectAbortController.abort();
      connectedAgentRef.current = null;
      setConnectedAgent(null);
      void agent.detachActiveRun?.();
    };
  }, [agent, config.label, connectionAttempt, copilotkit, isRuntimeConnected, threadId]);

  const retryConnection = useCallback(() => {
    connectedAgentRef.current = null;
    setConnectionFailure(null);
    setConnectionAttempt((attempt) => attempt + 1);
  }, []);

  // CopilotKit's public agent message type is looser than the AG-UI runtime
  // shape this renderer consumes; keep that cast at the integration boundary.
  const messages = (agent?.messages ?? []) as AguiMessage[];
  const items = toRenderItems(messages);
  const isRunning = agent?.isRunning ?? false;
  const artifact = selectArtifact(agent?.state as Record<string, unknown>, config);
  const showCommandSuggestions = items.length === 0;

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
      const messageId = crypto.randomUUID();
      setSubmittedMessageId(messageId);
      agent.addMessage({ id: messageId, role: "user", content });
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
    <div data-agent-chat-surface className="flex min-h-0 flex-1 flex-col bg-muted/20">
      <ToolRendererRegistration />
      <MessageScrollerProvider
        autoScroll
        defaultScrollPosition="last-anchor"
        scrollPreviousItemPeek={0}
      >
        <SubmittedMessageScroll
          messageId={submittedMessageId}
          onScrollStarted={handleSubmissionScrollStarted}
        />
        <MessageScroller className="flex-1">
          <MessageScrollerViewport>
            <MessageScrollerContent
              aria-busy={isRunning}
              className="mx-auto w-full max-w-205 p-4 sm:p-6"
            >
              {items.length === 0 && isAgentConnected ? (
                <Empty className="mx-auto max-w-2xl items-start border-none px-0 text-start">
                  <EmptyMedia variant="icon">
                    <AgentIcon agentId={config.id} className="text-page" />
                  </EmptyMedia>
                  <EmptyHeader className="items-start">
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
                          {activityMessage(item.message as never)}
                        </MessageScrollerItem>
                      );
                    }
                    if (item.kind === "user") {
                      return (
                        <MessageScrollerItem
                          key={item.id}
                          messageId={item.id}
                          scrollAnchor={item.id !== submittedMessageId}
                        >
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
        <div className="mx-auto w-full max-w-205">
          {gated ? (
            <ConnectNotice agentLabel={config.label} />
          ) : (
            <>
              {currentConnectionFailure && (
                <div
                  role="alert"
                  className="mb-2 flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm"
                >
                  <span>{currentConnectionFailure}</span>
                  <Button type="button" variant="outline" size="sm" onClick={retryConnection}>
                    Retry
                  </Button>
                </div>
              )}
              {isAgentConnected && !isRunning && visibleSuggestions.length > 0 && (
                <Suggestions
                  data-agent-suggestions
                  className={cn("mb-2", showCommandSuggestions && "w-full flex-col items-stretch")}
                >
                  {visibleSuggestions.map((s, index) => (
                    <Suggestion
                      key={suggestionKey(s)}
                      className={cn(
                        showCommandSuggestions &&
                          "h-auto justify-between rounded-md py-2.5 font-mono",
                      )}
                      suggestion={s.title}
                      onClick={() => void send(s.message)}
                    >
                      {showCommandSuggestions ? (
                        <>
                          <span className="flex items-center gap-3">
                            <span className="text-page">{String(index + 1).padStart(2, "0")}</span>
                            <span>{s.title}</span>
                          </span>
                          <ArrowRightIcon data-icon="inline-end" />
                        </>
                      ) : null}
                    </Suggestion>
                  ))}
                </Suggestions>
              )}
              <PromptInputProvider>
                <PromptInput
                  data-agent-composer
                  onSubmitCapture={dismissKeyboard}
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
                      <PromptInputSubmit
                        disabled={!isAgentConnected && !isRunning}
                        status={isRunning ? "streaming" : "ready"}
                        onStop={stop}
                      />
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
