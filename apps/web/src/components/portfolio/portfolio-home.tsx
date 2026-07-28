import { ArrowRight, Braces, Database, Server } from "lucide-react";

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
    <div
      data-portfolio-page
      className="flex min-h-screen flex-col font-sans text-foreground selection:bg-accent"
    >
      <SiteHeader />

      <main className="mx-auto w-full max-w-7xl flex-1 px-5 py-12 sm:px-8 sm:py-16 lg:py-20">
        <section className="relative border-b border-border pb-14 lg:pb-18">
          <div className="grid gap-10 lg:grid-cols-12 lg:items-end">
            <div className="lg:col-span-10">
              <p className="font-mono text-xs tracking-widest text-primary uppercase">
                Software engineer · Seattle
              </p>
              <h1 className="mt-6 max-w-5xl text-5xl/10 font-medium tracking-tighter text-balance sm:text-7xl/15 lg:text-8xl/19">
                Hi, I’m <span className="text-primary">Lucas.</span> I build agentic products from
                idea to launch.
              </h1>
            </div>
            <div className="hidden justify-end lg:col-span-2 lg:flex">
              <div data-field-grid className="flex size-36 items-end border border-border p-4">
                <span className="font-mono text-xs tracking-widest text-primary uppercase">
                  LA — 01
                </span>
              </div>
            </div>
          </div>
        </section>

        <section
          aria-label="About me"
          className="grid border-b border-border py-14 lg:grid-cols-12 lg:gap-10 lg:py-16"
        >
          <div className="hidden font-mono text-xs tracking-widest text-primary lg:col-span-1 lg:block">
            01
          </div>
          <div className="text-base/7 sm:text-lg/8 lg:col-span-8">
            <GeneratedIntroduction />
          </div>
          <aside className="mt-12 border-t border-border pt-6 lg:col-span-3 lg:mt-0 lg:border-s lg:border-t-0 lg:ps-8 lg:pt-0">
            <p className="font-mono text-xs tracking-widest text-primary uppercase">
              System status
            </p>
            <dl className="mt-5 divide-y divide-border border-y border-border font-mono text-xs">
              <div className="flex items-center justify-between gap-4 py-3">
                <dt className="flex items-center gap-2 text-muted-foreground">
                  <Server aria-hidden="true" className="size-3.5" />
                  Gateway
                </dt>
                <dd>Go</dd>
              </div>
              <div className="flex items-center justify-between gap-4 py-3">
                <dt className="flex items-center gap-2 text-muted-foreground">
                  <Braces aria-hidden="true" className="size-3.5" />
                  Runtime
                </dt>
                <dd>Next.js</dd>
              </div>
              <div className="flex items-center justify-between gap-4 py-3">
                <dt className="flex items-center gap-2 text-muted-foreground">
                  <Database aria-hidden="true" className="size-3.5" />
                  State
                </dt>
                <dd>D1 + R2</dd>
              </div>
            </dl>
          </aside>
        </section>

        <AgentRack />

        <div className="mt-14 flex flex-col gap-5 border border-border bg-card/80 p-5 sm:mt-18 sm:flex-row sm:items-center sm:justify-between sm:p-7">
          <p className="text-base/7 sm:text-lg/8">
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
          <ArrowRight aria-hidden="true" className="size-5 shrink-0 text-primary" />
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
