import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@agents/ui/lib/utils";
import { AgentIcon } from "@/components/agent-icon";
import type { AgentId } from "../chat/agents/registry";

/**
 * The three agents worth showing a visitor first. Colors come from the shared
 * agent identity tokens (see the registry's `colorVar`), written as literal
 * utility classes so Tailwind's scanner keeps them.
 */
const featuredAgents = [
  {
    id: "grocery",
    title: "Grocery",
    description: "Turns a weeknight idea into a list you can actually shop.",
    wiring: "Kroger cart",
    href: "/console/grocery",
    accentClassName: "bg-grocery text-background",
    hoverClassName: "hover:border-grocery",
  },
  {
    id: "resume",
    title: "Resume",
    description: "Answers questions about my work. No sign-in needed.",
    wiring: "My resume",
    href: "/console/resume",
    accentClassName: "bg-resume text-background",
    hoverClassName: "hover:border-resume",
  },
  {
    id: "trends",
    title: "Trends",
    description: "Explores what people are searching for right now.",
    wiring: "Google Trends",
    href: "/console/trends",
    accentClassName: "bg-trends text-background",
    hoverClassName: "hover:border-trends",
  },
] as const satisfies ReadonlyArray<{
  id: AgentId;
  title: string;
  description: string;
  wiring: string;
  href: string;
  accentClassName: string;
  hoverClassName: string;
}>;

export function AgentRack() {
  return (
    <section
      aria-labelledby="agents-heading"
      className="grid border-b border-border py-14 sm:py-18 lg:grid-cols-12 lg:gap-10"
      id="agents"
    >
      <div className="hidden font-mono text-xs tracking-widest text-primary lg:col-span-1 lg:block">
        02
      </div>
      <div className="lg:col-span-11">
        <h2
          className="font-mono text-xs tracking-widest text-primary uppercase"
          id="agents-heading"
        >
          Agents you can open
        </h2>

        <ul className="mt-5 divide-y divide-border border-y border-border">
          {featuredAgents.map(
            ({ id, title, description, wiring, href, accentClassName, hoverClassName }, index) => (
              <li key={title}>
                <Link
                  aria-label={`${title}: ${description}`}
                  className={cn(
                    "group grid min-h-28 border-x border-border bg-card/70 transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring sm:flex",
                    hoverClassName,
                  )}
                  href={href}
                  target="_top"
                >
                  <span
                    className={cn(
                      "grid min-h-20 place-items-center border-b border-border sm:min-h-full sm:w-24 sm:shrink-0 sm:border-e sm:border-b-0",
                      accentClassName,
                    )}
                  >
                    <AgentIcon agentId={id} className="size-7" />
                  </span>
                  <span className="hidden items-center justify-center border-e border-border font-mono text-xs text-primary sm:flex sm:w-16 sm:shrink-0">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="flex flex-col justify-center gap-1 px-5 py-4 sm:min-w-0 sm:flex-1 sm:border-e sm:border-border">
                    <span className="text-xl font-medium tracking-tight">{title}</span>
                    <span className="text-sm/6 text-muted-foreground">{description}</span>
                  </span>
                  <span className="hidden items-center px-5 font-mono text-xs text-primary sm:flex sm:w-44 sm:shrink-0">
                    {wiring}
                  </span>
                  <span className="hidden items-center justify-center sm:flex sm:w-12 sm:shrink-0">
                    <ArrowRight
                      aria-hidden="true"
                      className="size-4 transition-transform group-hover:translate-x-1 motion-reduce:transition-none"
                    />
                  </span>
                </Link>
              </li>
            ),
          )}
        </ul>

        <p className="mt-5 border-s border-primary ps-4 font-mono text-xs/5 text-muted-foreground">
          Travel, fitness, wellness, expenses, research, spreadsheets, and slides run on the same
          gateway.
        </p>
      </div>
    </section>
  );
}
