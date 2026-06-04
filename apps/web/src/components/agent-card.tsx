import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { AgentStatus } from "@/hooks/use-agent-warmup";

export type Agent = {
  id: string;
  href: string;
  name: string;
  tagline: string;
  description: string;
  cta: string;
  tags: string[];
  theme: "travel" | "grocery" | "fitness" | "wellness" | "a2ui";
};

const THEME: Record<Agent["theme"], { color: string; hover: string }> = {
  travel: { color: "#ea580c", hover: "#fff7f3" },
  grocery: { color: "#16a34a", hover: "#f4fbf6" },
  fitness: { color: "#0284c7", hover: "#f2f8fd" },
  wellness: { color: "#d97706", hover: "#fdf8f2" },
  a2ui: { color: "#0891b2", hover: "#effcff" },
};

export function AgentCard({
  agent,
  status,
}: {
  agent: Agent;
  index: number;
  status?: AgentStatus;
}) {
  const t = THEME[agent.theme];
  const isWellness = agent.theme === "wellness";
  const isA2UI = agent.theme === "a2ui";

  return (
    <Link href={agent.href} className="group block">
      <div
        className="agent-row flex gap-5 px-5 py-6 md:gap-8 md:px-8 md:py-8"
        style={{ "--row-hover": t.hover } as React.CSSProperties}
      >
        {/* Number + connector line */}
        <div className="flex w-10 shrink-0 flex-col items-center md:w-14">
          <span
            className="font-mono text-2xl leading-none font-bold tabular-nums md:text-3xl"
            style={{ color: t.color }}
          >
            {agent.id}
          </span>
          <span
            className="mt-3 min-h-[24px] w-px flex-1"
            style={{ backgroundColor: t.color, opacity: 0.18 }}
          />
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <h2 className="text-lg leading-tight font-bold tracking-tight text-[var(--ink)] md:text-xl">
              {agent.name}
            </h2>
            <span className="text-sm leading-tight font-medium" style={{ color: t.color }}>
              {agent.tagline}
            </span>
            {isWellness && (
              <span
                className="border px-1.5 py-0.5 font-mono text-[9px] leading-none tracking-wider uppercase"
                style={{ color: t.color, borderColor: t.color, opacity: 0.65 }}
              >
                A2A
              </span>
            )}
            {isA2UI && (
              <span
                className="border px-1.5 py-0.5 font-mono text-[9px] leading-none tracking-wider uppercase"
                style={{ color: t.color, borderColor: t.color, opacity: 0.65 }}
              >
                A2UI
              </span>
            )}
          </div>

          <p className="mb-3 max-w-lg text-sm leading-relaxed text-[var(--ink-mute)]">
            {agent.description}
          </p>

          <div className="flex flex-wrap gap-1.5">
            {agent.tags.map((tag) => (
              <span
                key={tag}
                className="bg-[var(--bg-soft)] px-2 py-1 font-mono text-[9px] tracking-wider text-[var(--ink-mute)] uppercase"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="flex shrink-0 flex-col items-end gap-2 pt-0.5">
          {status !== undefined && (
            <span
              title={
                status === "loading" ? "Checking…" : status === "ok" ? "Running" : "Unavailable"
              }
              className={`h-1.5 w-1.5 rounded-full ${
                status === "loading"
                  ? "animate-pulse bg-[var(--ink-mute)] opacity-40"
                  : status === "ok"
                    ? "animate-pulse"
                    : "bg-red-400 opacity-60"
              }`}
              style={status === "ok" ? { backgroundColor: t.color } : undefined}
            />
          )}
          <span
            className="flex items-center gap-1 text-sm font-semibold whitespace-nowrap transition-all group-hover:gap-2"
            style={{ color: t.color }}
          >
            {agent.cta}
            <ArrowUpRight className="h-4 w-4 shrink-0" />
          </span>
        </div>
      </div>
    </Link>
  );
}
