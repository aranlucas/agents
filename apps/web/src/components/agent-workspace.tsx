"use client";

import React, { useState } from "react";
import { CopilotChat, useDefaultRenderTool } from "@copilotkit/react-core/v2";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type MobilePanel = "chat" | "artifact" | "context";

type AgentWorkspaceProps = {
  context?: React.ReactNode;
  chat: React.ReactNode;
  artifact: React.ReactNode;
  className?: string;
  defaultMobilePanel?: MobilePanel;
  mobileLabels?: Partial<Record<MobilePanel, string>>;
};

type AgentChatPanelProps = {
  agentId: string;
  title: string;
  placeholder: string;
  welcomeMessage?: string;
  interrupts?: React.ReactNode;
  className?: string;
};

export const AGENT_CHAT_SLOT_CLASSES = [
  "ai-elements-copilot-chat",
  "ai-elements-conversation",
  "ai-elements-message-view",
  "ai-elements-assistant-message",
  "ai-elements-user-message",
  "ai-elements-prompt-input",
] as const;

const DEFAULT_MOBILE_LABELS: Record<MobilePanel, string> = {
  chat: "Chat",
  artifact: "Output",
  context: "Context",
};

export function AgentWorkspace({
  context,
  chat,
  artifact,
  className,
  defaultMobilePanel = "chat",
  mobileLabels,
}: AgentWorkspaceProps) {
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>(defaultMobilePanel);
  const labels = { ...DEFAULT_MOBILE_LABELS, ...mobileLabels };
  const panels: MobilePanel[] = context ? ["chat", "artifact", "context"] : ["chat", "artifact"];

  return (
    <div className="flex flex-1 flex-col">
      <div className="sticky top-[51px] z-10 border-b border-[var(--border-soft)] bg-[color-mix(in_srgb,var(--bg)_92%,transparent)] px-4 py-2 backdrop-blur xl:hidden">
        <div
          className="grid rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] p-1 shadow-[var(--shadow-card)]"
          style={{ gridTemplateColumns: `repeat(${panels.length}, 1fr)` }}
        >
          {panels.map((panel) => (
            <button
              key={panel}
              type="button"
              onClick={() => setMobilePanel(panel)}
              className={cn(
                "h-8 rounded-md text-xs font-semibold transition-colors",
                mobilePanel === panel
                  ? "bg-[var(--page-color,var(--accent))] text-[var(--page-contrast,#fff)] shadow-sm"
                  : "text-[var(--ink-mute)] hover:text-[var(--ink)]",
              )}
            >
              {labels[panel]}
            </button>
          ))}
        </div>
      </div>

      <div
        className={cn(
          "mx-auto grid w-full max-w-[1480px] flex-1 gap-4 p-4 md:p-6",
          context
            ? "xl:grid-cols-[300px_minmax(380px,0.86fr)_minmax(0,1.14fr)]"
            : "xl:grid-cols-[minmax(400px,0.86fr)_minmax(0,1.14fr)]",
          "lg:min-h-0",
          className,
        )}
      >
        {context && (
          <aside
            className={cn(
              "order-2 min-w-0 lg:min-h-0 xl:sticky xl:top-16 xl:order-1 xl:block xl:max-h-[calc(100vh-5.5rem)] xl:overflow-y-auto",
              mobilePanel !== "context" && "hidden",
            )}
          >
            {context}
          </aside>
        )}

        <section
          className={cn(
            "order-1 min-w-0 lg:min-h-0 xl:block",
            context && "xl:order-2",
            mobilePanel !== "chat" && "hidden",
          )}
          aria-label="Agent conversation"
        >
          {chat}
        </section>

        <section
          className={cn(
            "order-3 min-w-0 lg:min-h-0 xl:block",
            mobilePanel !== "artifact" && "hidden",
          )}
          aria-label="Live agent artifact"
        >
          {artifact}
        </section>
      </div>
    </div>
  );
}

export function AgentChatPanel({
  agentId,
  title,
  placeholder,
  welcomeMessage,
  interrupts,
  className,
}: AgentChatPanelProps) {
  return (
    <section
      className={cn(
        "flex h-[min(760px,calc(100vh-7.5rem))] min-h-[560px] flex-col overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-card)]",
        className,
      )}
    >
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--border-soft)] bg-[var(--surface-soft)] px-4">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-[var(--ink)]">{title}</h2>
          <p className="truncate text-[11px] text-[var(--ink-mute)]">
            Chat is the command surface. Artifacts update live.
          </p>
        </div>
      </div>

      <div className="agent-chat-shell min-h-0 flex-1">
        <AgentToolEventRenderer />
        {interrupts && (
          <div className="border-b border-[var(--border-soft)] bg-[var(--surface-soft)] p-3">
            {interrupts}
          </div>
        )}
        <CopilotChat
          agentId={agentId}
          autoScroll="pin-to-send"
          chatView="ai-elements-copilot-chat"
          messageView={{
            className: "ai-elements-message-view",
            assistantMessage: "ai-elements-assistant-message",
            userMessage: "ai-elements-user-message",
            cursor: "ai-elements-streaming-cursor",
          }}
          scrollView={{
            className: "ai-elements-conversation",
            scrollToBottomButton: "ai-elements-scroll-button",
            feather: "ai-elements-conversation-feather",
          }}
          suggestionView={{
            container: "ai-elements-suggestions",
            suggestion: "ai-elements-suggestion",
          }}
          input={{
            className: "ai-elements-prompt-input",
            textArea: "ai-elements-prompt-input-textarea",
            sendButton: "ai-elements-prompt-input-submit",
            addMenuButton: "ai-elements-prompt-input-tool",
            startTranscribeButton: "ai-elements-prompt-input-tool",
            cancelTranscribeButton: "ai-elements-prompt-input-tool",
            finishTranscribeButton: "ai-elements-prompt-input-submit",
            disclaimer: "ai-elements-prompt-input-disclaimer",
          }}
          labels={{
            chatInputPlaceholder: placeholder,
            ...(welcomeMessage ? { welcomeMessageText: welcomeMessage } : undefined),
          }}
        />
      </div>
    </section>
  );
}

function AgentToolEventRenderer() {
  useDefaultRenderTool(
    {
      render: ({ name, parameters, status, result }) => {
        const event = toolEventLabel(name);
        const isActive = status === "inProgress" || status === "executing";
        const hasParams =
          typeof parameters === "object" &&
          parameters !== null &&
          Object.keys(parameters).length > 0;
        const hasResult = status === "complete" && result !== undefined;

        return (
          <Card className="my-2 gap-0 border-[var(--border-soft)] bg-[var(--surface-soft)] p-3 py-3 text-sm shadow-none">
            <div className="flex items-start gap-3">
              <span
                className={cn(
                  "mt-1 h-2 w-2 shrink-0 rounded-full",
                  isActive
                    ? "animate-pulse bg-[var(--page-color,var(--accent))]"
                    : "bg-[var(--success)]",
                )}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-[var(--ink)]">{event}</span>
                  <Badge
                    variant="outline"
                    className="h-auto border-[var(--border)] bg-[var(--bg-soft)] px-1.5 py-0.5 font-mono text-[9px] tracking-wider text-[var(--ink-mute)] uppercase"
                  >
                    {statusLabel(status)}
                  </Badge>
                </div>
                <p className="mt-0.5 truncate font-mono text-[10px] text-[var(--ink-mute)]">
                  {name}
                </p>
              </div>
            </div>

            {(hasParams || hasResult) && (
              <details className="mt-2 pl-5">
                <summary className="cursor-pointer text-xs text-[var(--ink-mute)]">Details</summary>
                <pre className="mt-1 max-h-44 overflow-auto rounded-md bg-[var(--bg-soft)] p-2 text-xs text-[var(--ink-soft)]">
                  {JSON.stringify(
                    {
                      ...(hasParams ? { parameters } : {}),
                      ...(hasResult ? { result } : {}),
                    },
                    null,
                    2,
                  )}
                </pre>
              </details>
            )}
          </Card>
        );
      },
    },
    [],
  );

  return null;
}

function statusLabel(status: string) {
  if (status === "complete") return "done";
  if (status === "executing") return "running";
  return "drafting";
}

function toolEventLabel(name: string) {
  const normalized = name.replace(/[_-]+/g, " ").toLowerCase();

  if (normalized.includes("approval")) return "Waiting for your approval";
  if (normalized.includes("itinerary")) return "Updating the itinerary";
  if (normalized.includes("shopping") || normalized.includes("cart")) {
    return "Updating the shopping artifact";
  }
  if (normalized.includes("meal")) return "Planning meals";
  if (normalized.includes("flight")) return "Checking travel options";
  if (normalized.includes("fitness") || normalized.includes("training")) {
    return "Updating the training plan";
  }
  if (normalized.includes("delegate")) return "Delegating to another agent";
  if (normalized.includes("surface") || normalized.includes("a2ui")) {
    return "Rendering an interface";
  }

  return "Agent used a tool";
}
