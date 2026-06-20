"use client";

import { useCallback, useState } from "react";
import { CopilotSidebar, useAgent, useCopilotKit, UseAgentUpdate } from "@copilotkit/react-core/v2";

import type { PresentationSlide, PresentationState } from "@agents/types";
import { cn, ScrollArea } from "@agents/ui";
import { SidebarInset, SidebarProvider } from "@agents/ui";
import { Streamdown } from "@agents/ui";
import { getAgentConfig } from "@/components/chat/agents/registry";
import { AppSidebar } from "@/components/chat/app-sidebar";
import { useNewThread } from "@/components/chat/use-new-thread";
import { cssVars } from "@/lib/css";

const AGENT_ID = "presentation" as const;

function SlideThumbnail({
  slide,
  index,
  active,
  onClick,
}: {
  slide: PresentationSlide;
  index: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full rounded border p-2 text-left transition-all",
        active
          ? "border-[var(--page-color)] bg-[color-mix(in_srgb,var(--page-color)_10%,transparent)]"
          : "border-border hover:border-muted-foreground/40",
      )}
    >
      <p className="text-xs text-muted-foreground mb-1">Slide {index + 1}</p>
      <p className="text-xs font-semibold truncate">{slide.heading || "(no title)"}</p>
    </button>
  );
}

function SlidePreview({
  slide,
  index,
  total,
  theme,
}: {
  slide: PresentationSlide;
  index: number;
  total: number;
  theme: string;
}) {
  const isDark = theme === "dark";
  const isMinimal = theme === "minimal";

  return (
    <div
      className={cn(
        "flex h-full flex-col rounded-lg border p-8 shadow-lg",
        isDark && "bg-gray-900 text-white border-gray-700",
        !isDark && !isMinimal && "bg-white text-gray-900 border-gray-200",
        isMinimal && "bg-gray-50 text-gray-900 border-gray-100",
      )}
    >
      {/* Slide number */}
      <div className="flex justify-between text-xs text-muted-foreground mb-6">
        <span className="text-[var(--page-color)] font-medium uppercase tracking-wider text-xs">
          {slide.type}
        </span>
        <span>
          {index + 1} / {total}
        </span>
      </div>

      {/* Heading */}
      <h2
        className={cn(
          "font-bold mb-4 leading-tight",
          slide.type === "title" ? "text-4xl" : "text-2xl",
        )}
      >
        {slide.heading}
      </h2>

      {/* Body */}
      {slide.body && (
        <div className="flex-1 min-h-0 overflow-auto">
          <div className="prose prose-sm max-w-none dark:prose-invert">
            <Streamdown>{slide.body}</Streamdown>
          </div>
        </div>
      )}

      {/* Speaker notes */}
      {slide.notes && (
        <div className="mt-6 border-t pt-4">
          <p className="text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wide">
            Speaker notes
          </p>
          <p className="text-xs text-muted-foreground">{slide.notes}</p>
        </div>
      )}
    </div>
  );
}

export function PresentationWorkspace({ threadId: _threadId }: { threadId: string }) {
  const config = getAgentConfig(AGENT_ID);
  const { agent } = useAgent({
    agentId: AGENT_ID,
    updates: [UseAgentUpdate.OnStateChanged, UseAgentUpdate.OnRunStatusChanged],
  });
  const { copilotkit } = useCopilotKit();
  const startNewThread = useNewThread(AGENT_ID);

  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const state = (agent?.state ?? {}) as PresentationState;
  const slides = state.slides ?? [];
  const theme = state.theme ?? "light";

  const [localActiveIndex, setLocalActiveIndex] = useState(0);
  const activeIndex =
    slides.length > 0
      ? Math.min(state.active_slide_index ?? localActiveIndex, slides.length - 1)
      : 0;
  const activeSlide = slides[activeIndex];

  const sendPrompt = useCallback(
    async (content: string) => {
      if (!agent) return;
      agent.addMessage({ id: crypto.randomUUID(), role: "user", content });
      await copilotkit.runAgent({ agent });
    },
    [agent, copilotkit],
  );

  const goTo = useCallback(
    (i: number) => {
      setLocalActiveIndex(i);
      void sendPrompt(`Switch to slide ${i + 1}.`);
    },
    [sendPrompt],
  );

  return (
    <SidebarProvider
      defaultOpen={false}
      className="h-dvh overflow-hidden"
      style={cssVars({ "--page-color": `var(${config.colorVar})` })}
    >
      <CopilotSidebar
        defaultOpen={false}
        labels={{
          modalHeaderTitle: "Presentation chat",
          chatInputPlaceholder: config.placeholder,
        }}
      />
      <AppSidebar activePath={`/console/${AGENT_ID}`} onNewThread={startNewThread} />
      <SidebarInset className="min-h-0 overflow-hidden">
        <div className="flex h-full min-h-0 bg-background">
          {/* Slide list sidebar */}
          <aside className="w-48 shrink-0 border-r flex flex-col">
            {/* Deck title */}
            <div className="shrink-0 border-b p-3">
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">
                {slides.length} slide{slides.length !== 1 ? "s" : ""}
              </p>
              <p className="text-sm font-semibold truncate">
                {state.title || "New presentation"}
              </p>
            </div>
            {/* Thumbnails */}
            <ScrollArea className="flex-1 p-2">
              {slides.length === 0 ? (
                <p className="text-xs text-muted-foreground p-2">
                  No slides yet. Ask in chat to build your deck.
                </p>
              ) : (
                <div className="flex flex-col gap-1">
                  {slides.map((slide, i) => (
                    <SlideThumbnail
                      key={slide.id}
                      slide={slide}
                      index={i}
                      active={i === activeIndex}
                      onClick={() => goTo(i)}
                    />
                  ))}
                </div>
              )}
            </ScrollArea>
          </aside>

          {/* Slide preview */}
          <div className="flex min-h-0 flex-1 flex-col">
            {activeSlide ? (
              <div className="flex flex-1 min-h-0 items-center justify-center p-8">
                <div className="w-full max-w-3xl aspect-video">
                  <SlidePreview
                    slide={activeSlide}
                    index={activeIndex}
                    total={slides.length}
                    theme={theme}
                  />
                </div>
              </div>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center text-muted-foreground">
                <p className="text-5xl">🎞</p>
                <p className="text-sm">
                  Ask me to build a presentation in the chat.
                  <br />
                  Try: &ldquo;Create a 10-slide pitch deck for a SaaS startup&rdquo;
                </p>
              </div>
            )}

            {/* Navigation arrows */}
            {slides.length > 1 && (
              <div className="shrink-0 flex items-center justify-center gap-4 border-t py-3">
                <button
                  type="button"
                  disabled={activeIndex === 0}
                  onClick={() => goTo(activeIndex - 1)}
                  className="rounded px-3 py-1 text-sm disabled:opacity-30 hover:bg-muted transition-colors"
                >
                  ← Prev
                </button>
                <span className="text-xs text-muted-foreground">
                  {activeIndex + 1} / {slides.length}
                </span>
                <button
                  type="button"
                  disabled={activeIndex === slides.length - 1}
                  onClick={() => goTo(activeIndex + 1)}
                  className="rounded px-3 py-1 text-sm disabled:opacity-30 hover:bg-muted transition-colors"
                >
                  Next →
                </button>
              </div>
            )}
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
