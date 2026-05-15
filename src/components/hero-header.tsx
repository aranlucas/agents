"use client";

import React from "react";

interface Props {
  isRunning: boolean;
  onToggleBrief?: () => void;
  briefOpenMobile?: boolean;
}

export function HeroHeader({
  isRunning,
  onToggleBrief,
  briefOpenMobile,
}: Props) {
  return (
    <header className="px-4 md:px-8 pt-5 pb-4 border-b border-[var(--border-soft)] glass sticky top-0 z-20">
      <div className="max-w-[1400px] mx-auto flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 shrink-0 rounded-xl bg-gradient-to-br from-[var(--accent)] to-pink-500 shadow-md flex items-center justify-center">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-5 h-5 text-white"
            >
              <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2Z" />
            </svg>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-base md:text-xl font-semibold tracking-tight text-[var(--ink)] truncate">
                Trip Studio
              </h1>
              <span className="hidden sm:inline text-[10px] font-mono tracking-wider uppercase text-[var(--ink-mute)] bg-[var(--bg-soft)] px-2 py-0.5 rounded-md border border-[var(--border)]">
                CopilotKit × ADK
              </span>
            </div>
            <p className="hidden sm:block text-xs text-[var(--ink-mute)] mt-0.5">
              Co-plan trips with an AI partner in real time.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span
            className={`hidden sm:inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-medium ${
              isRunning
                ? "bg-[var(--accent-soft)] text-[var(--accent-strong)]"
                : "bg-[var(--bg-soft)] text-[var(--ink-mute)]"
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isRunning
                  ? "bg-[var(--accent)] animate-pulse"
                  : "bg-[var(--success)]"
              }`}
            />
            {isRunning ? "Agent at work" : "Ready"}
          </span>

          {onToggleBrief && (
            <button
              type="button"
              onClick={onToggleBrief}
              aria-pressed={briefOpenMobile}
              className={`md:hidden inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition ${
                briefOpenMobile
                  ? "bg-[var(--accent)] text-white border-[var(--accent)]"
                  : "bg-[var(--surface)] text-[var(--ink-soft)] border-[var(--border)]"
              }`}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-3.5 h-3.5"
              >
                <line x1="4" y1="6" x2="20" y2="6" />
                <line x1="4" y1="12" x2="14" y2="12" />
                <line x1="4" y1="18" x2="18" y2="18" />
              </svg>
              Brief
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
