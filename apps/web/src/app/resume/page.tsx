import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowRight,
  Briefcase,
  Code2,
  ExternalLink,
  GraduationCap,
  Mail,
  MapPin,
  Rocket,
  Sparkles,
} from "lucide-react";

import {
  externalLinkProps,
  GITHUB_URL,
  LINKEDIN_URL,
  proseLinkClassName,
  SiteFooter,
  SiteHeader,
} from "@/components/portfolio/site-chrome";
import {
  RESUME_ABOUT,
  RESUME_BASICS,
  RESUME_EDUCATION,
  RESUME_PROJECTS,
  RESUME_ROLES,
  RESUME_SKILLS,
} from "@/lib/resume-content";
import { ResumePrintButton } from "./print-button";

export const metadata: Metadata = {
  title: "Resume",
  description:
    "Resume for Lucas Arango — senior software engineer building conversational AI and agentic products at DoorDash, Amazon, and AWS.",
};

function SectionLabel({ children }: { children: string }) {
  return <p className="font-mono text-xs tracking-widest text-primary uppercase">{children}</p>;
}

function ResumeCard({ labelledBy, children }: { labelledBy: string; children: ReactNode }) {
  return (
    <section aria-labelledby={labelledBy} className="border border-border bg-card/70 p-5">
      {children}
    </section>
  );
}

const resumeSecondaryLinkClassName =
  "inline-flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-sm font-medium transition-colors hover:border-primary";

export default function ResumePage() {
  return (
    <div
      data-portfolio-page
      className="flex min-h-screen flex-col font-sans text-foreground selection:bg-accent"
    >
      <div className="print:hidden">
        <SiteHeader />
      </div>

      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-12 sm:px-8 sm:py-16 print:max-w-none print:p-0">
        {/* Hero */}
        <section aria-labelledby="resume-name" className="border-b border-border pb-10">
          <p className="font-mono text-xs tracking-widest text-primary uppercase">
            Resume · {RESUME_BASICS.location}
          </p>
          <h1
            id="resume-name"
            className="mt-4 max-w-4xl text-4xl font-medium tracking-tight text-balance sm:text-6xl"
          >
            {RESUME_BASICS.name}
          </h1>
          <p className="mt-3 max-w-3xl text-lg text-muted-foreground sm:text-xl">
            {RESUME_BASICS.title}
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <MapPin aria-hidden="true" className="size-4" />
              {RESUME_BASICS.location}
            </span>
            <span aria-hidden="true" className="text-muted-foreground/60">
              ·
            </span>
            <a className={proseLinkClassName} href={`mailto:${RESUME_BASICS.email}`}>
              <span className="inline-flex items-center gap-1.5">
                <Mail aria-hidden="true" className="size-4" />
                {RESUME_BASICS.email}
              </span>
            </a>
            <span aria-hidden="true" className="text-muted-foreground/60">
              ·
            </span>
            <span>{RESUME_BASICS.phone}</span>
          </div>

          <div className="mt-8 flex flex-wrap gap-3 print:hidden">
            <Link
              href="/console/resume"
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Sparkles aria-hidden="true" className="size-4" />
              Ask the Resume agent
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
            <a href={LINKEDIN_URL} {...externalLinkProps} className={resumeSecondaryLinkClassName}>
              LinkedIn
              <ExternalLink aria-hidden="true" className="size-4" />
            </a>
            <a href={GITHUB_URL} {...externalLinkProps} className={resumeSecondaryLinkClassName}>
              GitHub
              <ExternalLink aria-hidden="true" className="size-4" />
            </a>
            <ResumePrintButton />
          </div>
        </section>

        <div className="grid gap-12 py-10 lg:grid-cols-12">
          {/* Main column */}
          <div className="lg:col-span-8">
            <section aria-labelledby="resume-summary">
              <SectionLabel>Summary</SectionLabel>
              <p id="resume-summary" className="mt-4 text-base/7 sm:text-lg/8">
                {RESUME_BASICS.summary}
              </p>
              <p className="mt-4 border-s border-primary ps-4 font-mono text-xs/5 text-muted-foreground">
                {RESUME_BASICS.lookingFor}
              </p>
            </section>

            <section aria-labelledby="resume-experience" className="mt-12">
              <div className="flex items-center gap-2">
                <Briefcase aria-hidden="true" className="size-4 text-primary" />
                <h2 id="resume-experience" className="text-2xl font-medium tracking-tight">
                  Experience
                </h2>
              </div>

              <ol className="mt-6 flex flex-col gap-8">
                {RESUME_ROLES.map((role) => (
                  <li
                    key={`${role.company}-${role.dates}`}
                    className="border border-border bg-card/70 p-5 sm:p-6"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h3 className="text-lg font-medium tracking-tight">
                        {role.company} — {role.title}
                      </h3>
                      <p className="font-mono text-xs text-muted-foreground">{role.dates}</p>
                    </div>
                    <p className="mt-1 font-mono text-xs tracking-widest text-muted-foreground uppercase">
                      {role.location}
                    </p>
                    <ul className="mt-4 flex list-disc flex-col gap-2 ps-5 text-sm/6 text-ink-soft sm:text-base/7">
                      {role.bullets.map((bullet) => (
                        <li key={bullet.slice(0, 48)}>{bullet}</li>
                      ))}
                    </ul>
                    {role.projects ? (
                      <div className="mt-5 border-t border-border pt-4">
                        <p className="font-mono text-xs tracking-widest text-primary uppercase">
                          Key projects
                        </p>
                        <ul className="mt-3 flex flex-col gap-3">
                          {role.projects.map((project) => (
                            <li
                              key={project.name}
                              className="rounded-md border border-border bg-muted/40 px-3 py-2.5 text-sm/6"
                            >
                              <span className="font-medium">{project.name}</span>
                              <span className="text-muted-foreground">
                                {" "}
                                — {project.description}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {role.links ? (
                      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
                        {role.links.map((link) => (
                          <a
                            key={link.href}
                            className={proseLinkClassName}
                            href={link.href}
                            {...externalLinkProps}
                          >
                            <span className="inline-flex items-center gap-1">
                              {link.label}
                              <ExternalLink aria-hidden="true" className="size-3.5" />
                            </span>
                          </a>
                        ))}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ol>
            </section>

            <section aria-labelledby="resume-projects" className="mt-12">
              <div className="flex items-center gap-2">
                <Rocket aria-hidden="true" className="size-4 text-primary" />
                <h2 id="resume-projects" className="text-2xl font-medium tracking-tight">
                  {RESUME_PROJECTS.heading}
                </h2>
              </div>
              <p className="mt-4 text-base/7 text-ink-soft">{RESUME_PROJECTS.intro}</p>
              <ul className="mt-4 flex list-disc flex-col gap-2 ps-5 text-sm/6 text-ink-soft sm:text-base/7">
                {RESUME_PROJECTS.bullets.map((bullet) => (
                  <li key={bullet.slice(0, 48)}>{bullet}</li>
                ))}
              </ul>
              <p className="mt-4 text-sm text-muted-foreground">
                You&apos;re experiencing one right now — this resume Q&A is itself one of my agents.{" "}
                <Link className={proseLinkClassName} href="/console/resume">
                  Try it
                </Link>
                .
              </p>
            </section>
          </div>

          {/* Sidebar */}
          <aside className="lg:col-span-4">
            <div className="flex flex-col gap-8 lg:sticky lg:top-24">
              <ResumeCard labelledBy="resume-skills">
                <div className="flex items-center gap-2">
                  <Code2 aria-hidden="true" className="size-4 text-primary" />
                  <h2 id="resume-skills" className="text-lg font-medium tracking-tight">
                    Skills
                  </h2>
                </div>
                <dl className="mt-4 flex flex-col gap-4 text-sm/6">
                  <div>
                    <dt className="font-mono text-xs tracking-widest text-muted-foreground uppercase">
                      Technologies
                    </dt>
                    <dd className="mt-1 text-ink-soft">{RESUME_SKILLS.technologies}</dd>
                  </div>
                  <div>
                    <dt className="font-mono text-xs tracking-widest text-muted-foreground uppercase">
                      Languages
                    </dt>
                    <dd className="mt-1 text-ink-soft">{RESUME_SKILLS.languages}</dd>
                  </div>
                </dl>
              </ResumeCard>

              <ResumeCard labelledBy="resume-education">
                <div className="flex items-center gap-2">
                  <GraduationCap aria-hidden="true" className="size-4 text-primary" />
                  <h2 id="resume-education" className="text-lg font-medium tracking-tight">
                    Education
                  </h2>
                </div>
                <div className="mt-4 text-sm/6">
                  <p className="font-medium">{RESUME_EDUCATION.school}</p>
                  <p className="text-ink-soft">{RESUME_EDUCATION.degree}</p>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">
                    {RESUME_EDUCATION.location} · {RESUME_EDUCATION.dates}
                  </p>
                  <p className="mt-1 text-muted-foreground">{RESUME_EDUCATION.details}</p>
                </div>
              </ResumeCard>

              <ResumeCard labelledBy="resume-about">
                <SectionLabel>About Lucas</SectionLabel>
                <ul className="mt-4 flex list-disc flex-col gap-2 ps-5 text-sm/6 text-ink-soft">
                  {RESUME_ABOUT.map((item) => (
                    <li key={item.slice(0, 40)}>{item}</li>
                  ))}
                </ul>
              </ResumeCard>

              <section
                aria-labelledby="resume-contact"
                className="border border-primary/40 bg-accent px-5 py-4 print:hidden"
              >
                <h2 id="resume-contact" className="text-base font-medium text-accent-foreground">
                  Hiring for senior / staff?
                </h2>
                <p className="mt-1 text-sm/6 text-accent-foreground">
                  Paste the job description into the Resume agent for a grounded fit brief — no
                  sign-in needed.
                </p>
                <Link
                  href="/console/resume"
                  className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-primary underline decoration-primary/35 underline-offset-4 hover:text-primary/80"
                >
                  Open the Resume agent
                  <ArrowRight aria-hidden="true" className="size-4" />
                </Link>
              </section>
            </div>
          </aside>
        </div>
      </main>

      <div className="print:hidden">
        <SiteFooter />
      </div>
    </div>
  );
}
