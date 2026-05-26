import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

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

const THEME: Record<Agent["theme"], { color: string; hover: string }> = {
  travel:   { color: "#ea580c", hover: "#fff7f3" },
  grocery:  { color: "#16a34a", hover: "#f4fbf6" },
  fitness:  { color: "#0284c7", hover: "#f2f8fd" },
  wellness: { color: "#d97706", hover: "#fdf8f2" },
};

export function AgentCard({ agent }: { agent: Agent; index: number }) {
  const t = THEME[agent.theme];
  const isWellness = agent.theme === "wellness";

  return (
    <Link href={agent.href} className="group block">
      <div
        className="agent-row flex gap-5 md:gap-8 px-5 md:px-8 py-6 md:py-8"
        style={{ "--row-hover": t.hover } as React.CSSProperties}
      >
        {/* Number + connector line */}
        <div className="flex flex-col items-center shrink-0 w-10 md:w-14">
          <span
            className="font-mono text-2xl md:text-3xl font-bold leading-none tabular-nums"
            style={{ color: t.color }}
          >
            {agent.id}
          </span>
          <span
            className="w-px flex-1 mt-3 min-h-[24px]"
            style={{ backgroundColor: t.color, opacity: 0.18 }}
          />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 mb-2">
            <h2 className="text-lg md:text-xl font-bold tracking-tight text-[var(--ink)] leading-tight">
              {agent.name}
            </h2>
            <span className="text-sm font-medium leading-tight" style={{ color: t.color }}>
              {agent.tagline}
            </span>
            {isWellness && (
              <span
                className="font-mono text-[9px] uppercase tracking-wider border px-1.5 py-0.5 leading-none"
                style={{ color: t.color, borderColor: t.color, opacity: 0.65 }}
              >
                A2A
              </span>
            )}
          </div>

          <p className="text-sm text-[var(--ink-mute)] leading-relaxed max-w-lg mb-3">
            {agent.description}
          </p>

          <div className="flex flex-wrap gap-1.5">
            {agent.tags.map((tag) => (
              <span
                key={tag}
                className="font-mono text-[9px] uppercase tracking-wider px-2 py-1 bg-[var(--bg-soft)] text-[var(--ink-mute)]"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="shrink-0 flex items-start pt-0.5">
          <span
            className="flex items-center gap-1 text-sm font-semibold group-hover:gap-2 transition-all whitespace-nowrap"
            style={{ color: t.color }}
          >
            {agent.cta}
            <ArrowUpRight className="w-4 h-4 shrink-0" />
          </span>
        </div>
      </div>
    </Link>
  );
}
