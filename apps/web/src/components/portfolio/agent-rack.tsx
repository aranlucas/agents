import Link from "next/link";

/**
 * The three agents worth showing a visitor first. Colors come from the shared
 * agent identity tokens (see the registry's `colorVar`), written as literal
 * utility classes so Tailwind's scanner keeps them.
 */
const featuredAgents = [
  {
    title: "Grocery",
    description: "Turns a weeknight idea into a list you can actually shop.",
    wiring: "Kroger cart",
    href: "/console/grocery",
    dotClassName: "bg-grocery",
    cardClassName: "hover:border-grocery",
  },
  {
    title: "Resume",
    description: "Answers questions about my work. No sign-in needed.",
    wiring: "My resume",
    href: "/console/resume",
    dotClassName: "bg-resume",
    cardClassName: "hover:border-resume",
  },
  {
    title: "Trends",
    description: "Explores what people are searching for right now.",
    wiring: "Google Trends",
    href: "/console/trends",
    dotClassName: "bg-trends",
    cardClassName: "hover:border-trends",
  },
] as const;

export function AgentRack() {
  return (
    <section aria-labelledby="agents-heading" className="mt-16 sm:mt-20" id="agents">
      <h2
        className="font-mono text-xs tracking-widest text-muted-foreground uppercase"
        id="agents-heading"
      >
        Agents you can open
      </h2>

      <ul className="mt-4 grid gap-3 sm:grid-cols-3">
        {featuredAgents.map(({ title, description, wiring, href, dotClassName, cardClassName }) => (
          <li key={title}>
            <Link
              className={`group flex h-full flex-col rounded-lg border border-border bg-card p-4 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${cardClassName}`}
              href={href}
              target="_top"
            >
              <span className="flex items-center gap-2 text-base font-medium">
                <span aria-hidden="true" className={`size-2 rounded-full ${dotClassName}`} />
                {title}
              </span>
              <span className="mt-2 text-sm/6 text-muted-foreground">{description}</span>
              <span className="mt-4 flex items-center justify-between gap-2 border-t border-border pt-3 font-mono text-xs text-muted-foreground">
                {wiring}
                <span
                  aria-hidden="true"
                  className="transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
                >
                  →
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <p className="mt-4 text-sm/6 text-muted-foreground">
        Travel, fitness, wellness, expenses, research, spreadsheets, and slides run on the same
        gateway.
      </p>
    </section>
  );
}
