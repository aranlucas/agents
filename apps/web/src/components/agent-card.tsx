import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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

export function AgentCard({ agent, index }: { agent: Agent; index: number }) {
  return (
    <Card
      className={cn(
        "group relative gap-4 p-5 transition hover:border-[var(--accent)] hover:shadow-md",
        agent.theme === "travel" &&
          "bg-[linear-gradient(135deg,var(--surface),color-mix(in_srgb,#ec4899_5%,var(--surface)))]",
        agent.theme === "grocery" &&
          "bg-[linear-gradient(135deg,var(--surface),color-mix(in_srgb,var(--success)_5%,var(--surface)))]",
        agent.theme === "fitness" &&
          "bg-[linear-gradient(135deg,var(--surface),color-mix(in_srgb,#0ea5e9_6%,var(--surface)))]",
        agent.theme === "wellness" &&
          "bg-[linear-gradient(135deg,var(--surface),color-mix(in_srgb,#f59e0b_6%,var(--surface)))]",
      )}
      style={{ animationDelay: `${index * 110}ms` }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute right-4 top-3 font-mono text-5xl font-semibold leading-none text-[var(--bg-soft)]"
      >
        {agent.id}
      </span>

      <div className="relative flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--ink-mute)]">
          AGENT · {agent.id}
        </span>
        <Badge variant="outline" className="bg-[var(--bg-soft)]">
          Live
        </Badge>
      </div>

      <div className="relative space-y-1">
        <h2 className="text-lg font-semibold tracking-tight text-[var(--ink)]">
          {agent.name}
        </h2>
        <p className="text-sm font-medium text-[var(--ink-soft)]">
          {agent.tagline}
        </p>
        <p className="text-sm leading-6 text-[var(--ink-mute)]">
          {agent.description}
        </p>
      </div>

      <div className="relative mt-auto flex items-end justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {agent.tags.map((tag) => (
            <Badge key={tag} variant="outline" className="bg-[var(--surface-soft)]">
              {tag}
            </Badge>
          ))}
        </div>
        <Button
          nativeButton={false}
          render={<Link href={agent.href} />}
          variant="link"
          className="h-auto shrink-0 px-0 text-[var(--accent-strong)]"
        >
          {agent.cta}
          <ArrowUpRight />
        </Button>
      </div>
    </Card>
  );
}
