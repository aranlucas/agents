import { AgentRack } from "./agent-rack";
import { GeneratedIntroduction } from "./generated-introduction";
import {
  externalLinkProps,
  GITHUB_URL,
  LINKEDIN_URL,
  proseLinkClassName,
  SiteFooter,
  SiteHeader,
} from "./site-chrome";

export function PortfolioHome() {
  return (
    <div className="flex min-h-screen flex-col font-sans text-foreground selection:bg-accent">
      <SiteHeader />

      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-14 text-lg/8 sm:px-8 sm:py-20">
        <p className="font-mono text-xs tracking-widest text-muted-foreground uppercase">
          Software engineer · Seattle
        </p>

        <h1 className="mt-5 text-4xl/tight font-medium tracking-tight text-balance sm:text-5xl/tight">
          <span className="text-muted-foreground">Hi, I’m Lucas.</span> I build agentic products
          from idea to launch.
        </h1>

        <section aria-label="About me" className="mt-10">
          <GeneratedIntroduction />
        </section>

        <AgentRack />

        <p className="mt-16 sm:mt-20">
          You can view my code on{" "}
          <a className={proseLinkClassName} href={GITHUB_URL} {...externalLinkProps}>
            GitHub
          </a>{" "}
          or connect with me on{" "}
          <a className={proseLinkClassName} href={LINKEDIN_URL} {...externalLinkProps}>
            LinkedIn
          </a>
          .
        </p>
      </main>

      <SiteFooter />
    </div>
  );
}
