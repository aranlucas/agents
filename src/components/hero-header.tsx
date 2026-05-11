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
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg md:text-xl font-semibold tracking-tight text-[var(--ink)]">
                Collab Studio
              </h1>
              <span className="text-[10px] font-mono tracking-wider uppercase text-[var(--ink-mute)] bg-[var(--bg-soft)] px-2 py-0.5 rounded-md border border-[var(--border)]">
                CopilotKit × ADK
              </span>
            </div>
            <p className="text-xs text-[var(--ink-mute)] mt-0.5">
              A writing surface for humans and agents to share.
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
