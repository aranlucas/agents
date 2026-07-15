import Link from "next/link";
import { cn } from "@agents/ui/lib/utils";
import { ArrowRight } from "lucide-react";

import { AgentIcon } from "@/components/agent-icon";
import { ThemeToggle } from "@/components/theme-toggle";

import { GeneratedIntroduction } from "./generated-introduction";

const externalLinkProps = {
  target: "_blank",
  rel: "noreferrer",
} as const;

const ideas = [
  {
    title: "What would I build for my own life?",
    description:
      "Bring the way I build software into everyday life: break down a problem, automate the repeatable parts, and keep the result useful.",
  },
  {
    title: "What should it research for me?",
    description:
      "Compare options, surface tradeoffs, and bring back the details I need to make a decision.",
  },
  {
    title: "What should it finish?",
    description:
      "Turn decisions into useful next steps: an itinerary, shopping list, workout, reminder, or draft I can review.",
  },
] as const;

const agentDemos = [
  {
    id: "travel",
    title: "Trip Studio",
    description: "Create durable itineraries.",
    href: "/console/travel",
    colorClass: "text-travel",
  },
  {
    id: "grocery",
    title: "Grocery",
    description: "Ground meal plans and shopping lists in commerce tools.",
    href: "/console/grocery",
    colorClass: "text-grocery",
  },
  {
    id: "fitness",
    title: "Fitness",
    description: "Turn goals and activity into a training plan.",
    href: "/console/fitness",
    colorClass: "text-fitness",
  },
  {
    id: "wellness",
    title: "Wellness",
    description: "Coordinate grocery and fitness into one week.",
    href: "/console/wellness",
    colorClass: "text-wellness",
  },
  {
    id: "expense",
    title: "Expense Desk",
    description: "Audit expenses and produce a report.",
    href: "/console/expense",
    colorClass: "text-expense",
  },
  {
    id: "oral-boards",
    title: "Oral Boards",
    description: "Run a staged clinical examination.",
    href: "/console/oral-boards",
    colorClass: "text-oral-boards",
  },
  {
    id: "trends",
    title: "Trends",
    description: "Explore search trends visually.",
    href: "/console/trends",
    colorClass: "text-trends",
  },
  {
    id: "research",
    title: "Research",
    description: "Turn a question into a structured report.",
    href: "/console/research",
    colorClass: "text-research",
  },
  {
    id: "spreadsheet",
    title: "Spreadsheet",
    description: "Create and revise spreadsheets.",
    href: "/console/spreadsheet",
    colorClass: "text-spreadsheet",
  },
  {
    id: "presentation",
    title: "Slides",
    description: "Build a presentation on a live surface.",
    href: "/console/presentation",
    colorClass: "text-presentation",
  },
] as const;

function SiteHeader() {
  return (
    <header className="mx-auto flex max-w-2xl items-center justify-between gap-6 px-5 pt-7 sm:px-0 sm:pt-10">
      <Link
        className="flex items-center gap-2.5 rounded-sm text-base font-semibold tracking-tight focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
        href="/"
        target="_top"
      >
        <span className="grid size-7 place-items-center rounded-md border border-border bg-surface-raised font-mono text-xs font-semibold text-primary">
          LA
        </span>
        <span>Lucas Arango</span>
      </Link>
      <nav
        aria-label="External links"
        className="flex items-center gap-3 text-sm text-muted-foreground"
      >
        <a
          className="hover:text-foreground"
          href="https://github.com/aranlucas"
          {...externalLinkProps}
        >
          GitHub
        </a>
        <ThemeToggle />
      </nav>
    </header>
  );
}

function Ideas() {
  return (
    <section aria-labelledby="ideas-heading" className="mt-20 sm:mt-24">
      <h2 id="ideas-heading" className="mt-0">
        What I want personal agents to handle
      </h2>
      <ol className="mt-5 list-none border-t border-border p-0">
        {ideas.map((idea, index) => (
          <li
            className="mt-0 grid gap-3 border-b border-border py-6 ps-0 sm:grid-cols-12 sm:gap-5"
            key={idea.title}
          >
            <span className="font-mono text-xs leading-6 text-muted-foreground sm:col-span-1">
              {String(index + 1).padStart(2, "0")}
            </span>
            <article className="typeset typeset-site sm:col-span-11">
              <h3>{idea.title}</h3>
              <p className="mt-2 max-w-xl text-muted-foreground">{idea.description}</p>
            </article>
          </li>
        ))}
      </ol>
    </section>
  );
}

function AgentDemos() {
  return (
    <section aria-labelledby="agents-heading" className="mt-20 sm:mt-24">
      <h2 id="agents-heading" className="mt-0">
        Working agents
      </h2>
      <ul className="mt-5 list-none border-t border-border p-0">
        {agentDemos.map(({ id, title, description, href, colorClass }) => (
          <li className="mt-0 border-b border-border ps-0" key={title}>
            <Link
              className="group grid grid-cols-12 items-center gap-x-3 gap-y-1 rounded-sm py-3.5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring sm:gap-4"
              href={href}
              target="_top"
            >
              <span
                className={cn(
                  "col-span-1 row-span-2 grid size-7 place-items-center sm:row-span-1",
                  colorClass,
                )}
              >
                <AgentIcon agentId={id} />
              </span>
              <span className="col-span-9 text-base font-medium tracking-tight group-hover:underline group-hover:underline-offset-4 sm:col-span-3">
                {title}
              </span>
              <span className="col-span-11 col-start-2 pe-6 text-sm leading-6 text-muted-foreground sm:col-span-7 sm:col-start-auto">
                {description}
              </span>
              <span
                aria-hidden="true"
                className="col-span-2 col-start-11 row-start-1 text-right text-sm text-muted-foreground transition-transform group-hover:translate-x-0.5 sm:col-span-1 sm:col-start-auto sm:row-start-auto"
              >
                <ArrowRight className="ms-auto size-3.5" strokeWidth={1.75} />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function About() {
  return (
    <section
      aria-labelledby="about-heading"
      className="mt-20 min-h-56 border-t border-border pt-7 sm:mt-24"
    >
      <h2 id="about-heading" className="mt-0">
        About me
      </h2>
      <GeneratedIntroduction />
    </section>
  );
}

export function PortfolioHome() {
  return (
    <div className="min-h-screen bg-background font-sans text-foreground selection:bg-accent">
      <SiteHeader />

      <main className="typeset typeset-site mx-auto max-w-2xl px-5 pb-20 sm:px-0 sm:pb-28">
        <section className="pt-20 sm:pt-28">
          <h1 className="max-w-2xl text-4xl/10 font-medium tracking-tighter text-balance sm:text-5xl/12">
            Hi, I’m Lucas.
          </h1>
          <p className="mt-7 max-w-2xl text-lg/8 tracking-tight text-ink-soft sm:text-xl/8">
            I’m exploring what agents can do by building them for my own life.
          </p>
          <About />
        </section>

        <Ideas />
        <AgentDemos />
      </main>

      <footer className="mx-auto flex max-w-2xl items-center justify-between border-t border-border px-5 py-7 text-sm text-muted-foreground sm:px-0">
        <span>Lucas Arango</span>
        <span>Agents as software.</span>
      </footer>
    </div>
  );
}
