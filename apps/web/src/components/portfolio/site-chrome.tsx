import Link from "next/link";

import { ThemeToggle } from "@/components/theme-toggle";

export const externalLinkProps = {
  target: "_blank",
  rel: "noreferrer",
} as const;

export const GITHUB_URL = "https://github.com/aranlucas";
export const LINKEDIN_URL = "https://www.linkedin.com/in/lucasarango/";

/** Underlined inline link used inside running prose. */
export const proseLinkClassName =
  "rounded-sm font-medium underline decoration-muted-foreground underline-offset-3 transition-colors hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/** Quiet nav link — mono, so navigation reads as machinery, not prose. */
const navLinkClassName =
  "rounded-sm font-mono text-xs tracking-widest text-muted-foreground uppercase transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-4 px-5 sm:px-8">
        <Link
          className="rounded-sm font-mono text-xs font-medium tracking-widest text-foreground uppercase focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          href="/"
        >
          Lucas Arango
        </Link>
        <nav aria-label="Site" className="flex items-center gap-5 sm:gap-6">
          <Link className={navLinkClassName} href="#agents">
            Agents
          </Link>
          <a className={navLinkClassName} href={GITHUB_URL} {...externalLinkProps}>
            GitHub
          </a>
          <a
            className={`${navLinkClassName} hidden sm:inline`}
            href={LINKEDIN_URL}
            {...externalLinkProps}
          >
            LinkedIn
          </a>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-3xl flex-col gap-3 px-5 py-8 font-mono text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <p>Seattle, WA</p>
        <p>Next.js · Go agent gateway · Cloudflare D1 and R2</p>
      </div>
    </footer>
  );
}
