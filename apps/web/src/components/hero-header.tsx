"use client";

import React from "react";
import Link from "next/link";
import { ArrowLeft, ListFilter } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  name: string;
  description?: string;
  icon: React.ReactNode;
  isRunning: boolean;
  statusLabel?: string;
  onToggleBrief?: () => void;
  briefOpenMobile?: boolean;
}

export function HeroHeader({
  name,
  description,
  icon,
  isRunning,
  statusLabel,
  onToggleBrief,
  briefOpenMobile,
}: Props) {
  return (
    <header className="sticky top-0 z-20 bg-[var(--page-color-soft)] [border-top:3px_solid_var(--page-color)] [border-bottom:1px_solid_color-mix(in_srgb,var(--page-color)_22%,transparent)]">
      <div className="flex items-center gap-3 px-4 py-2.5 md:px-6 max-w-[1400px] mx-auto">
        <Link
          href="/"
          className="shrink-0 flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-mute)] hover:text-[var(--page-color)] transition-colors"
        >
          <ArrowLeft className="w-3 h-3" />
          <span className="hidden sm:inline">Agents</span>
        </Link>

        <span className="h-4 w-px shrink-0 bg-[var(--border)]" />

        <div className="w-7 h-7 shrink-0 rounded-lg flex items-center justify-center text-white shadow-sm bg-[var(--page-color)]">
          {icon}
        </div>

        <div className="flex-1 min-w-0 flex items-baseline gap-2">
          <h1 className="shrink-0 text-sm font-bold tracking-tight text-[var(--ink)]">
            {name}
          </h1>
          {description && (
            <p className="hidden md:block text-xs text-[var(--ink-mute)] truncate min-w-0">
              {description}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div
            className={cn(
              "hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-full text-[11px] font-medium",
              isRunning
                ? "bg-[var(--page-color)] text-white"
                : "bg-white/60 text-[var(--ink-soft)]",
            )}
          >
            <span
              className={cn(
                "w-1.5 h-1.5 rounded-full",
                isRunning
                  ? "bg-white animate-pulse"
                  : "bg-[var(--ink-mute)]",
              )}
            />
            {isRunning ? "Working…" : (statusLabel ?? "Ready")}
          </div>

          {onToggleBrief && (
            <button
              type="button"
              onClick={onToggleBrief}
              aria-pressed={briefOpenMobile}
              className={cn(
                "md:hidden flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
                briefOpenMobile
                  ? "bg-[var(--page-color)] text-white border-transparent"
                  : "bg-transparent text-[var(--ink-mute)] border-[var(--border)]",
              )}
            >
              <ListFilter className="w-3 h-3" />
              Brief
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
