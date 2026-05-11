"use client";

import React from "react";

interface Props {
  isRunning: boolean;
}

export function HeroHeader({ isRunning }: Props) {
  return (
    <header className="px-6 md:px-8 pt-6 pb-4 border-b border-[var(--border-soft)] glass">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[var(--accent)] to-pink-500 shadow-md flex items-center justify-center">
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
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg md:text-xl font-semibold tracking-tight text-[var(--ink)]">
                Trip Studio
              </h1>
              <span className="text-[10px] font-mono tracking-wider uppercase text-[var(--ink-mute)] bg-[var(--bg-soft)] px-2 py-0.5 rounded-md border border-[var(--border)]">
                CopilotKit × ADK
              </span>
            </div>
            <p className="text-xs text-[var(--ink-mute)] mt-0.5">
              Co-plan trips with an AI partner in real time.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-medium ${
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
        </div>
      </div>
    </header>
  );
}
