"use client";

import React, { useEffect, useRef, useState } from "react";

export type DocStatus = "idle" | "drafting" | "ready_for_review" | "published";

interface Props {
  title: string;
  content: string;
  status: DocStatus;
  isStreaming: boolean;
  onTitleChange: (next: string) => void;
  onContentChange: (next: string) => void;
  onReset: () => void;
  reviewSummary?: string;
}

const STATUS_META: Record<
  DocStatus,
  { label: string; dotClass: string; chipClass: string }
> = {
  idle: {
    label: "Empty",
    dotClass: "bg-[var(--ink-mute)]",
    chipClass: "text-[var(--ink-soft)] bg-[var(--bg-soft)]",
  },
  drafting: {
    label: "Drafting",
    dotClass: "bg-[var(--accent)] animate-pulse",
    chipClass: "text-[var(--accent-strong)] bg-[var(--accent-soft)]",
  },
  ready_for_review: {
    label: "Ready for review",
    dotClass: "bg-[var(--warning)]",
    chipClass:
      "text-[var(--warning)] bg-[color-mix(in_srgb,var(--warning)_14%,transparent)]",
  },
  published: {
    label: "Published",
    dotClass: "bg-[var(--success)]",
    chipClass:
      "text-[var(--success)] bg-[var(--success-soft)] dark:bg-[color-mix(in_srgb,var(--success)_16%,transparent)]",
  },
};

export function DocumentCanvas({
  title,
  content,
  status,
  isStreaming,
  onTitleChange,
  onContentChange,
  onReset,
  reviewSummary,
}: Props) {
  const meta = STATUS_META[status];
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const [isUserEditing, setIsUserEditing] = useState(false);

  const wordCount = content.trim()
    ? content.trim().split(/\s+/).length
    : 0;
  const readingTime = Math.max(1, Math.round(wordCount / 220));

  useEffect(() => {
    if (!isUserEditing && editorRef.current && isStreaming) {
      const el = editorRef.current;
      el.scrollTop = el.scrollHeight;
    }
  }, [content, isStreaming, isUserEditing]);

  return (
    <section className="flex flex-col h-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-sm overflow-hidden">
      <header className="flex items-center justify-between gap-3 px-6 py-4 border-b border-[var(--border-soft)]">
        <div className="flex-1 min-w-0">
          <input
            type="text"
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder="Untitled document"
            className="w-full bg-transparent text-xl md:text-2xl font-semibold tracking-tight text-[var(--ink)] placeholder-[var(--ink-mute)] focus:outline-none"
          />
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--ink-mute)]">
            <span
              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full font-medium ${meta.chipClass}`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${meta.dotClass}`}
              />
              {meta.label}
            </span>
            <span>·</span>
            <span>{wordCount} words</span>
            <span>·</span>
            <span>{readingTime} min read</span>
            {isStreaming && (
              <>
                <span>·</span>
                <span className="text-[var(--accent-strong)] font-medium">
                  agent typing
                </span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onReset}
            className="px-3 py-1.5 text-xs rounded-lg border border-[var(--border)] bg-[var(--surface-soft)] text-[var(--ink-soft)] hover:text-[var(--ink)] hover:border-[var(--accent)] transition"
          >
            Clear
          </button>
        </div>
      </header>

      {status === "ready_for_review" && reviewSummary && (
        <div className="mx-6 mt-4 rounded-xl border border-[color-mix(in_srgb,var(--warning)_30%,transparent)] bg-[color-mix(in_srgb,var(--warning)_8%,transparent)] px-4 py-3 text-xs text-[var(--ink-soft)]">
          <span className="font-semibold text-[var(--warning)]">
            Agent says:
          </span>{" "}
          {reviewSummary}
        </div>
      )}

      <div className="flex-1 min-h-0 px-6 py-5 relative">
        <textarea
          ref={editorRef}
          value={content}
          onChange={(e) => onContentChange(e.target.value)}
          onFocus={() => setIsUserEditing(true)}
          onBlur={() => setIsUserEditing(false)}
          placeholder="Ask the agent to start drafting — or write the first line yourself. Whatever you change here is visible to the agent on its next turn."
          spellCheck={false}
          className="w-full h-full resize-none bg-transparent text-[15px] leading-7 text-[var(--ink)] placeholder-[var(--ink-mute)] focus:outline-none font-[var(--font-sans)]"
        />
        {isStreaming && !isUserEditing && (
          <div className="pointer-events-none absolute top-5 right-6 inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-[10px] font-mono tracking-wider uppercase bg-[var(--accent-soft)] text-[var(--accent-strong)]">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-pulse" />
            Live
          </div>
        )}
      </div>
    </section>
  );
}
