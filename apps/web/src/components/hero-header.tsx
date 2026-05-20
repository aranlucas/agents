"use client";

import React from "react";
import { ListFilter, Plane } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
            <Plane className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-base md:text-xl font-semibold tracking-tight text-[var(--ink)] truncate">
                Trip Studio
              </h1>
              <Badge
                variant="outline"
                className="hidden h-auto rounded-md px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider sm:inline-flex"
              >
                CopilotKit × ADK
              </Badge>
            </div>
            <p className="hidden sm:block text-xs text-[var(--ink-mute)] mt-0.5">
              Co-plan trips with an AI partner in real time.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Badge
            variant="outline"
            className={cn(
              "hidden h-auto gap-2 border-transparent px-3 py-1.5 text-[11px] sm:inline-flex",
              isRunning
                ? "bg-[var(--accent-soft)] text-[var(--accent-strong)]"
                : "bg-[var(--bg-soft)] text-[var(--ink-mute)]",
            )}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isRunning
                  ? "bg-[var(--accent)] animate-pulse"
                  : "bg-[var(--success)]"
              }`}
            />
            {isRunning ? "Agent at work" : "Ready"}
          </Badge>

          {onToggleBrief && (
            <Button
              type="button"
              onClick={onToggleBrief}
              aria-pressed={briefOpenMobile}
              variant={briefOpenMobile ? "default" : "outline"}
              size="sm"
              className="rounded-full md:hidden"
            >
              <ListFilter className="w-3.5 h-3.5" />
              Brief
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
