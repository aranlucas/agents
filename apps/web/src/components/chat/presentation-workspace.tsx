"use client";

import { useState } from "react";
import { CopilotSidebar, useAgent, UseAgentUpdate } from "@copilotkit/react-core/v2";

import type { PresentationSlide, PresentationState } from "@agents/types";
import { cn, ScrollArea } from "@agents/ui";
import { SidebarInset, SidebarProvider } from "@agents/ui";
import { Streamdown } from "@agents/ui";
import { getAgentConfig } from "@/components/chat/agents/registry";
import { AppSidebar } from "@/components/chat/app-sidebar";
import { ConsoleTopBar } from "@/components/chat/console-top-bar";
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
        "w-full rounded border p-2 text-start transition-all",
        active ? "border-page bg-page/10" : "border-border hover:border-muted-foreground/40",
      )}
    >
      <p className="mb-1 text-xs text-muted-foreground">Slide {index + 1}</p>
      <p className="truncate text-xs font-semibold">{slide.heading || "(no title)"}</p>
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
        isDark && "border-gray-700 bg-gray-900 text-white",
        !isDark && !isMinimal && "border-gray-200 bg-white text-gray-900",
        isMinimal && "border-gray-100 bg-gray-50 text-gray-900",
      )}
    >
      {/* Slide number */}
      <div className="mb-6 flex justify-between text-xs text-muted-foreground">
        <span className="text-xs font-medium tracking-wider text-page uppercase">{slide.type}</span>
        <span>
          {index + 1} / {total}
        </span>
      </div>

      {/* Heading */}
      <h2
        className={cn(
          "mb-4 leading-tight font-bold",
          slide.type === "title" ? "text-4xl" : "text-2xl",
        )}
      >
        {slide.heading}
      </h2>

      {/* Body */}
      {slide.body && (
        <div className="min-h-0 flex-1 overflow-auto">
          <div className="grow">
            <Streamdown>{slide.body}</Streamdown>
          </div>
        </div>
      )}

      {/* Speaker notes */}
      {slide.notes && (
        <div className="typeset typeset-site mt-6 border-t pt-4">
          <p className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Speaker notes
          </p>
          <p className="mt-0 text-muted-foreground">{slide.notes}</p>
        </div>
      )}
    </div>
  );
}

export function PresentationWorkspace({ threadId }: { threadId: string }) {
  const config = getAgentConfig(AGENT_ID);
  const { agent } = useAgent({
    agentId: AGENT_ID,
    updates: [UseAgentUpdate.OnStateChanged, UseAgentUpdate.OnRunStatusChanged],
  });
  const startNewThread = useNewThread(AGENT_ID);

  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const state = (agent?.state ?? {}) as PresentationState;
  const slides = state.slides ?? [];
  const theme = state.theme ?? "light";

  // The backend-selected slide is the initial view. User navigation is local UI
  // state: moving between existing slides must not spend an LLM turn.
  const [localActiveIndex, setLocalActiveIndex] = useState<number | null>(null);
  const activeIndex =
    slides.length > 0
      ? Math.max(0, Math.min(localActiveIndex ?? state.active_slide_index ?? 0, slides.length - 1))
      : 0;
  const activeSlide = slides[activeIndex];

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
      <AppSidebar
        activePath={`/console/${AGENT_ID}`}
        agentId={AGENT_ID}
        activeThreadId={threadId}
        onNewThread={startNewThread}
      />
      <SidebarInset className="min-h-0 overflow-hidden">
        <ConsoleTopBar agentId={AGENT_ID} threadId={threadId} isRunning={agent?.isRunning} />
        <div className="flex min-h-0 flex-1 bg-background">
          {/* Slide list sidebar */}
          <aside className="flex w-48 shrink-0 flex-col border-e">
            {/* Deck title */}
            <div className="shrink-0 border-b p-3">
              <p className="mb-0.5 text-xs tracking-wide text-muted-foreground uppercase">
                {slides.length} slide{slides.length !== 1 ? "s" : ""}
              </p>
              <p className="truncate text-sm font-semibold">{state.title ?? "New presentation"}</p>
            </div>
            {/* Thumbnails */}
            <ScrollArea className="flex-1 p-2">
              {slides.length === 0 ? (
                <p className="p-2 text-xs text-muted-foreground">
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
                      onClick={() => setLocalActiveIndex(i)}
                    />
                  ))}
                </div>
              )}
            </ScrollArea>
          </aside>

          {/* Slide preview */}
          <div className="flex min-h-0 flex-1 flex-col">
            {activeSlide ? (
              <div className="flex min-h-0 flex-1 items-center justify-center p-8">
                <div className="aspect-video w-full max-w-3xl">
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
              <div className="flex shrink-0 items-center justify-center gap-4 border-t py-3">
                <button
                  type="button"
                  disabled={activeIndex === 0}
                  onClick={() => setLocalActiveIndex(activeIndex - 1)}
                  className="rounded px-3 py-1 text-sm transition-colors hover:bg-muted disabled:opacity-30"
                >
                  ← Prev
                </button>
                <span className="text-xs text-muted-foreground">
                  {activeIndex + 1} / {slides.length}
                </span>
                <button
                  type="button"
                  disabled={activeIndex === slides.length - 1}
                  onClick={() => setLocalActiveIndex(activeIndex + 1)}
                  className="rounded px-3 py-1 text-sm transition-colors hover:bg-muted disabled:opacity-30"
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
