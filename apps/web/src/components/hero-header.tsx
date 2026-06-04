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
    <header className="sticky top-0 z-20 bg-[var(--page-color-soft)] [border-bottom:1px_solid_color-mix(in_srgb,var(--page-color)_22%,transparent)] [border-top:3px_solid_var(--page-color)]">
      <div className="mx-auto flex max-w-[1400px] items-center gap-3 px-4 py-2.5 md:px-6">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-1 font-mono text-[10px] tracking-[0.18em] text-[var(--ink-mute)] uppercase transition-colors hover:text-[var(--page-color)]"
        >
          <ArrowLeft className="h-3 w-3" />
          <span className="hidden sm:inline">Agents</span>
        </Link>

        <span className="h-4 w-px shrink-0 bg-[var(--border)]" />

        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--page-color)] text-white shadow-sm">
          {icon}
        </div>

        <div className="flex min-w-0 flex-1 items-baseline gap-2">
          <h1 className="shrink-0 text-sm font-bold tracking-tight text-[var(--ink)]">{name}</h1>
          {description && (
            <p className="hidden min-w-0 truncate text-xs text-[var(--ink-mute)] md:block">
              {description}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <div
            className={cn(
              "hidden items-center gap-2 rounded-full px-2.5 py-1 text-[11px] font-medium sm:flex",
              isRunning
                ? "bg-[var(--page-color)] text-white"
                : "bg-white/60 text-[var(--ink-soft)]",
            )}
          >
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                isRunning ? "animate-pulse bg-white" : "bg-[var(--ink-mute)]",
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
                "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors md:hidden",
                briefOpenMobile
                  ? "border-transparent bg-[var(--page-color)] text-white"
                  : "border-[var(--border)] bg-transparent text-[var(--ink-mute)]",
              )}
            >
              <ListFilter className="h-3 w-3" />
              Brief
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
