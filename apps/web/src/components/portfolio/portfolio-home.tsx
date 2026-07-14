import Link from "next/link";

import { ThemeToggle } from "@/components/theme-toggle";

import { GeneratedIntroduction } from "./generated-introduction";

const externalLinkProps = {
  target: "_blank",
  rel: "noreferrer",
} as const;

const ideas = [
  {
    title: "What can I stop doing manually?",
    description:
      "I’m looking for repetitive planning, research, and coordination an agent can own.",
  },
  {
    title: "What should an agent remember?",
    description: "Automation gets useful when preferences, decisions, and state carry forward.",
  },
  {
    title: "How should it hand the work back?",
    description: "The result should be something I can inspect, change, and use.",
  },
] as const;

const agentDemos = [
  {
    title: "Trip Studio",
    description: "Create durable itineraries.",
    href: "/console/travel",
    glyph: "✈",
    color: "var(--travel)",
  },
  {
    title: "Grocery",
    description: "Ground meal plans and shopping lists in commerce tools.",
    href: "/console/grocery",
    glyph: "🛒",
    color: "var(--grocery)",
  },
  {
    title: "Fitness",
    description: "Turn goals and activity into a training plan.",
    href: "/console/fitness",
    glyph: "💪",
    color: "var(--fitness)",
  },
  {
    title: "Wellness",
    description: "Coordinate grocery and fitness into one week.",
    href: "/console/wellness",
    glyph: "☯",
    color: "var(--wellness)",
  },
  {
    title: "Expense Desk",
    description: "Audit expenses and produce a report.",
    href: "/console/expense",
    glyph: "$",
    color: "var(--expense)",
  },
  {
    title: "Oral Boards",
    description: "Run a staged clinical examination.",
    href: "/console/oral-boards",
    glyph: "◆",
    color: "var(--oral-boards)",
  },
  {
    title: "Trends",
    description: "Explore search trends visually.",
    href: "/console/trends",
    glyph: "↗",
    color: "var(--trends)",
  },
  {
    title: "Research",
    description: "Turn a question into a structured report.",
    href: "/console/research",
    glyph: "⌕",
    color: "var(--research)",
  },
  {
    title: "Spreadsheet",
    description: "Create and revise spreadsheets.",
    href: "/console/spreadsheet",
    glyph: "▦",
    color: "var(--spreadsheet)",
  },
  {
    title: "Slides",
    description: "Build a presentation on a live surface.",
    href: "/console/presentation",
    glyph: "▤",
    color: "var(--presentation)",
  },
] as const;

function TextLink({
  href,
  children,
  external = false,
}: {
  href: string;
  children: React.ReactNode;
  external?: boolean;
}) {
  const className =
    "text-primary decoration-primary/35 hover:text-accent-foreground focus-visible:outline-ring rounded-sm font-medium underline underline-offset-[3px] transition-colors hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-4";

  if (external) {
    return (
      <a className={className} href={href} {...externalLinkProps}>
        {children}
      </a>
    );
  }

  return (
    <Link className={className} href={href} target="_top">
      {children}
    </Link>
  );
}

function SiteHeader() {
  return (
    <header className="mx-auto flex max-w-[680px] items-center justify-between gap-6 px-5 pt-7 sm:px-0 sm:pt-10">
      <Link
        className="focus-visible:outline-ring flex items-center gap-2.5 rounded-sm text-[15px] font-semibold tracking-[-0.015em] focus-visible:outline-2 focus-visible:outline-offset-4"
        href="/"
        target="_top"
      >
        <span className="border-border text-primary grid size-7 place-items-center rounded-md border bg-(--surface-raised) font-mono text-[9px] font-semibold">
          LA
        </span>
        <span>Lucas Arango</span>
      </Link>
      <nav
        aria-label="External links"
        className="text-muted-foreground flex items-center gap-3 text-[13px]"
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
      <h2 id="ideas-heading" className="text-sm font-semibold tracking-[-0.01em]">
        What I want to automate
      </h2>
      <ol className="border-border mt-5 border-t">
        {ideas.map((idea, index) => (
          <li
            className="border-border grid gap-3 border-b py-6 sm:grid-cols-[2rem_1fr] sm:gap-5"
            key={idea.title}
          >
            <span className="text-muted-foreground font-mono text-[11px] leading-6">
              {String(index + 1).padStart(2, "0")}
            </span>
            <article>
              <h3 className="text-[18px] leading-7 font-medium tracking-[-0.02em]">{idea.title}</h3>
              <p className="text-muted-foreground mt-2 max-w-[590px] text-[15px] leading-7">
                {idea.description}
              </p>
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
      <div className="flex items-end justify-between gap-6">
        <h2 id="agents-heading" className="text-sm font-semibold tracking-[-0.01em]">
          Working agents
        </h2>
        <TextLink external href="https://github.com/aranlucas/agents">
          Source
        </TextLink>
      </div>
      <ul className="border-border mt-5 border-t">
        {agentDemos.map(({ title, description, href, glyph, color }) => (
          <li className="border-border border-b" key={title}>
            <Link
              className="agent-index-row focus-visible:outline-ring group grid grid-cols-[1.75rem_1fr_auto] items-center gap-x-3 gap-y-1 rounded-sm py-3.5 focus-visible:outline-2 focus-visible:outline-offset-4 sm:grid-cols-[1.75rem_8rem_1fr_auto] sm:gap-4"
              href={href}
              target="_top"
            >
              <span
                className="border-border row-span-2 grid size-7 place-items-center rounded-md border bg-(--surface-raised) font-mono text-[11px] sm:row-span-1"
                style={{ color }}
              >
                {glyph}
              </span>
              <span className="text-[15px] font-medium tracking-[-0.01em] group-hover:underline group-hover:underline-offset-4">
                {title}
              </span>
              <span className="text-muted-foreground col-span-2 col-start-2 pr-6 text-[14px] leading-6 sm:col-span-1 sm:col-start-auto">
                {description}
              </span>
              <span
                aria-hidden="true"
                className="text-muted-foreground col-start-3 row-start-1 text-sm transition-transform group-hover:translate-x-0.5 sm:col-start-auto sm:row-start-auto"
              >
                →
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
      className="border-border mt-20 h-56 overflow-hidden border-t pt-7 sm:mt-24"
    >
      <h2 id="about-heading" className="text-sm font-semibold tracking-[-0.01em]">
        About me
      </h2>
      <GeneratedIntroduction />
    </section>
  );
}

export function PortfolioHome() {
  return (
    <div className="bg-background text-foreground min-h-screen font-sans selection:bg-(--accent-soft)">
      <SiteHeader />

      <main className="mx-auto max-w-[680px] px-5 pb-20 sm:px-0 sm:pb-28">
        <section className="pt-20 sm:pt-28">
          <h1 className="max-w-[620px] text-[clamp(2.25rem,6vw,2.8rem)] leading-[1.08] font-medium tracking-[-0.045em] text-balance">
            Hi, I’m Lucas.
          </h1>
          <p className="mt-7 max-w-[640px] text-[18px] leading-8 tracking-[-0.015em] text-(--ink-soft) sm:text-[19px]">
            I’m exploring what agents can do by building them for my own life.
          </p>
          <About />
        </section>

        <Ideas />
        <AgentDemos />
      </main>

      <footer className="border-border text-muted-foreground mx-auto flex max-w-[680px] items-center justify-between border-t px-5 py-7 text-[13px] sm:px-0">
        <span>Lucas Arango</span>
        <span>Agents as software.</span>
      </footer>
    </div>
  );
}
