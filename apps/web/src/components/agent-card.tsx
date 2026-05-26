import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type Agent = {
  id: string;
  href: string;
  name: string;
  tagline: string;
  description: string;
  cta: string;
  tags: string[];
  theme: "travel" | "grocery" | "fitness" | "wellness";
};

const THEME: Record<Agent["theme"], { color: string; soft: string }> = {
  travel:   { color: "var(--travel)",   soft: "var(--travel-soft)"   },
  grocery:  { color: "var(--grocery)",  soft: "var(--grocery-soft)"  },
  fitness:  { color: "var(--fitness)",  soft: "var(--fitness-soft)"  },
  wellness: { color: "var(--wellness)", soft: "var(--wellness-soft)" },
};

export function AgentCard({ agent, index }: { agent: Agent; index: number }) {
  const t = THEME[agent.theme];
  const isWellness = agent.theme === "wellness";

  return (
    <Link
      href={agent.href}
      className="group block focus-visible:outline-none"
      style={{ animationDelay: `${index * 120}ms` }}
    >
      <div
        className={cn(
          "agent-card agent-card-reveal",
          "relative flex flex-col h-full rounded-2xl",
          "border border-[var(--border)] bg-[var(--surface)]",
          "overflow-hidden p-6 gap-0",
        )}
        style={{ "--agent-color": t.color } as React.CSSProperties}
      >
        {/* Left accent bar */}
        <span
          aria-hidden
          className="absolute left-0 inset-y-0 w-[3px] rounded-l-2xl"
          style={{ background: t.color }}
        />

        {/* Large background ID number */}
        <span
          aria-hidden
          className="pointer-events-none select-none absolute right-3 top-1 font-mono text-[88px] font-bold leading-none"
          style={{ color: t.color, opacity: 0.07 }}
        >
          {agent.id}
        </span>

        {/* Header row: mono label + live indicator */}
        <div className="relative flex items-center justify-between mb-5">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-mute)]">
            AGENT · {agent.id}
          </span>
          <div className="flex items-center gap-1.5">
            <span
              className="w-1.5 h-1.5 rounded-full animate-pulse"
              style={{ backgroundColor: t.color }}
            />
            <span className="font-mono text-[10px] text-[var(--ink-mute)]">Live</span>
          </div>
        </div>

        {/* Name */}
        <h2 className="relative text-xl font-semibold tracking-tight text-[var(--ink)] mb-1">
          {agent.name}
        </h2>

        {/* Tagline in agent color */}
        <p className="relative text-sm font-medium mb-4" style={{ color: t.color }}>
          {agent.tagline}
        </p>

        {/* Description */}
        <p className="relative text-sm leading-relaxed text-[var(--ink-mute)] flex-1 mb-5">
          {agent.description}
        </p>

        {/* A2A collaboration badge — Wellness only */}
        {isWellness && (
          <div className="relative flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-soft)] px-3 py-2 mb-4">
            <span
              className="w-2 h-2 shrink-0 rounded-full"
              style={{ backgroundColor: "var(--grocery)" }}
            />
            <span className="flex-1 h-px bg-gradient-to-r from-[var(--grocery)] to-[var(--fitness)]" />
            <span
              className="w-2 h-2 shrink-0 rounded-full"
              style={{ backgroundColor: "var(--fitness)" }}
            />
            <span className="font-mono text-[9px] uppercase tracking-[0.15em] text-[var(--ink-mute)] ml-1 shrink-0">
              A2A
            </span>
          </div>
        )}

        {/* Divider */}
        <div className="h-px bg-[var(--border)] mb-4" />

        {/* Tags + CTA */}
        <div className="relative flex items-end justify-between gap-3">
          <div className="flex flex-wrap gap-1.5">
            {agent.tags.map((tag) => (
              <span
                key={tag}
                className="font-mono text-[9px] uppercase tracking-[0.12em] px-2 py-1 rounded-md border border-[var(--border)] bg-[var(--bg-soft)] text-[var(--ink-mute)]"
              >
                {tag}
              </span>
            ))}
          </div>
          <span
            className="text-sm font-semibold shrink-0 flex items-center gap-1 group-hover:gap-2 transition-all"
            style={{ color: t.color }}
          >
            {agent.cta}
            <ArrowUpRight className="w-3.5 h-3.5" />
          </span>
        </div>
      </div>
    </Link>
  );
}
