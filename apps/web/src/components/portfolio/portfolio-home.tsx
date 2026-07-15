import Link from "next/link";

import { GeneratedIntroduction } from "./generated-introduction";

const externalLinkProps = {
  target: "_blank",
  rel: "noreferrer",
} as const;

const featuredAgents = [
  {
    title: "Grocery",
    description: "plans meals and shops with real tools",
    href: "/console/grocery",
  },
  {
    title: "Resume",
    description: "answers questions about my work",
    href: "/console/resume",
  },
  {
    title: "Trends",
    description: "explores what people are searching for",
    href: "/console/trends",
  },
] as const;

export function PortfolioHome() {
  return (
    <main className="mx-auto min-h-screen max-w-2xl px-5 py-12 font-sans text-lg/8 text-foreground selection:bg-accent sm:px-8 sm:py-16">
      <h1 className="text-2xl/8 font-medium tracking-tight">Hi, I’m Lucas.</h1>

      <section aria-label="About me">
        <GeneratedIntroduction />
      </section>

      <section aria-labelledby="agents-heading" className="mt-8">
        <h2 id="agents-heading" className="text-lg/8 font-normal">
          Some agents I’ve built:
        </h2>
        <ul className="mt-3 flex list-disc flex-col gap-1 ps-5 marker:text-muted-foreground">
          {featuredAgents.map(({ title, description, href }) => (
            <li className="ps-1" key={title}>
              <Link
                className="rounded-sm font-medium underline decoration-muted-foreground underline-offset-3 transition-colors hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                href={href}
                target="_top"
              >
                {title}
              </Link>{" "}
              — {description}
            </li>
          ))}
        </ul>
      </section>

      <p className="mt-8">
        You can view my code on{" "}
        <a
          className="rounded-sm font-medium underline decoration-muted-foreground underline-offset-3 transition-colors hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          href="https://github.com/aranlucas"
          {...externalLinkProps}
        >
          GitHub
        </a>{" "}
        or connect with me on{" "}
        <a
          className="rounded-sm font-medium underline decoration-muted-foreground underline-offset-3 transition-colors hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          href="https://www.linkedin.com/in/lucasarango/"
          {...externalLinkProps}
        >
          LinkedIn
        </a>
        .
      </p>
    </main>
  );
}
