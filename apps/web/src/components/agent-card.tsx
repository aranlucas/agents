import Link from "next/link";
import { ArrowUpRight, CheckCircle2, CircleAlert, Loader2 } from "lucide-react";

import { agentStyle, type AgentTheme } from "@/components/agent-theme";
import { Badge } from "@agents/ui";
import { buttonVariants } from "@agents/ui";
import { Card, CardContent } from "@agents/ui";
import type { AgentStatus } from "@/hooks/use-agent-warmup";
import { cn } from "@/lib/utils";

export type Agent = {
  id: string;
  href: string;
  name: string;
  tagline: string;
  description: string;
  cta: string;
  tags: string[];
  theme: AgentTheme;
};

export function AgentCard({
  agent,
  index,
  status,
}: {
  agent: Agent;
  index: number;
  status?: AgentStatus;
}) {
  const isWellness = agent.theme === "wellness";
  const isA2UI = agent.theme === "a2ui";

  return (
    <Card
      size="sm"
      className="group/card border-border bg-card relative gap-0 overflow-hidden py-0 shadow-(--shadow-card) transition-colors hover:border-[color-mix(in_srgb,var(--agent-color)_48%,var(--border))] hover:bg-(--surface-raised)"
      style={agentStyle(agent.theme)}
    >
      <Link
        href={agent.href}
        className="block outline-none focus-visible:ring-3 focus-visible:ring-(--agent-color)/40"
      >
        <CardContent className="grid gap-5 p-5 md:grid-cols-[72px_minmax(0,1fr)_auto] md:items-start md:p-6">
          <div className="flex items-center gap-3 md:block">
            <span className="text-muted-foreground font-mono text-[11px] font-medium">
              {String(index + 1).padStart(2, "0")}
            </span>
            <div className="h-1.5 flex-1 rounded-full bg-(--agent-soft) md:mt-3 md:h-16 md:w-1.5" />
          </div>

          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h2 className="text-foreground text-lg leading-tight font-semibold tracking-tight md:text-xl">
                {agent.name}
              </h2>
              <Badge
                variant="outline"
                className="border-[color-mix(in_srgb,var(--agent-color)_38%,transparent)] bg-(--agent-soft) text-(--agent-color)"
              >
                {agent.tagline}
              </Badge>
              {isWellness && <Badge variant="secondary">In-process</Badge>}
              {isA2UI && <Badge variant="secondary">A2UI</Badge>}
            </div>

            <p className="max-w-2xl text-sm leading-6 text-(--ink-soft)">{agent.description}</p>

            <div className="mt-4 flex flex-wrap gap-1.5">
              {agent.tags.map((tag) => (
                <Badge key={tag} variant="outline" className="bg-muted font-mono">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 md:flex-col md:items-end">
            <StatusBadge status={status} />
            <span
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "border-[color-mix(in_srgb,var(--agent-color)_42%,var(--border))] bg-(--surface-raised) text-(--agent-color) group-hover/card:bg-(--agent-soft)",
              )}
            >
              {agent.cta}
              <ArrowUpRight className="h-4 w-4 shrink-0 transition-transform group-hover/card:translate-x-0.5 group-hover/card:-translate-y-0.5" />
            </span>
          </div>
        </CardContent>
      </Link>
    </Card>
  );
}

function StatusBadge({ status }: { status?: AgentStatus }) {
  if (!status) return null;

  const Icon = status === "loading" ? Loader2 : status === "ok" ? CheckCircle2 : CircleAlert;
  const label = status === "loading" ? "Checking" : status === "ok" ? "Running" : "Offline";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-medium",
        status === "ok" &&
          "border-[color-mix(in_srgb,var(--agent-color)_38%,transparent)] bg-(--agent-soft) text-(--agent-color)",
        status === "loading" && "border-border bg-muted text-muted-foreground",
        status === "error" &&
          "text-destructive border-[color-mix(in_srgb,var(--danger)_35%,transparent)] bg-(--danger-soft)",
      )}
    >
      <Icon
        className={cn(
          "h-3.5 w-3.5",
          status === "loading" && "animate-spin",
          status === "ok" && "animate-pulse",
        )}
      />
      {label}
    </span>
  );
}
