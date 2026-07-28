"use client";

import { useState } from "react";
import type { JobCandidateStatus, JobsStatus } from "@agents/types";
import {
  Artifact,
  ArtifactActions,
  ArtifactClose,
  ArtifactContent,
  ArtifactDescription,
  ArtifactHeader,
  ArtifactTitle,
  Badge,
  Button,
  buttonVariants,
  Streamdown,
} from "@agents/ui";
import {
  BriefcaseBusiness,
  Check,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Copy,
  ExternalLink,
  FileText,
  Inbox,
  MapPin,
  Search,
  ShieldAlert,
  Target,
} from "lucide-react";

import { toJobsState } from "@/lib/agent-state";

import type { AgentArtifactProps } from "./extensions";

const STATUS_META: Record<JobsStatus, { label: string; className: string }> = {
  idle: {
    label: "Waiting for role",
    className: "border-border bg-muted/50 text-muted-foreground",
  },
  researching: {
    label: "Researching",
    className: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  },
  matching: {
    label: "Assessing fit",
    className: "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300",
  },
  drafting: {
    label: "Drafting",
    className: "border-page/35 bg-page/10 text-page",
  },
  ready: {
    label: "Ready for review",
    className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
};

const CANDIDATE_STATUS_META: Record<JobCandidateStatus, { label: string; className: string }> = {
  new: {
    label: "New",
    className: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  },
  shortlisted: {
    label: "Shortlisted",
    className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
  dismissed: {
    label: "Dismissed",
    className: "border-border bg-muted/50 text-muted-foreground",
  },
};

function labelVerdict(value: string) {
  return value.replaceAll("_", " ");
}

function formatRefreshedAt(value: string) {
  if (!value.trim()) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function CopyAnswer({ field, answer }: { field: string; answer: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(answer);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      aria-label={`Copy ${field} answer`}
      onClick={() => void copy()}
    >
      {copied ? <Check /> : <Copy />}
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}

export function JobsArtifact({ state: rawState, view, onClose }: AgentArtifactProps) {
  const state = toJobsState(rawState);
  const status = state.status ?? "idle";
  const statusMeta = STATUS_META[status];
  const watchlist = state.watchlist;
  const watchlistRoles = (watchlist?.roles ?? []).filter((item) => item.trim());
  const watchlistLocations = (watchlist?.locations ?? []).filter((item) => item.trim());
  const watchlistMustHave = (watchlist?.must_have ?? []).filter((item) => item.trim());
  const watchlistExclude = (watchlist?.exclude ?? []).filter((item) => item.trim());
  const activeCandidates = (state.inbox ?? []).filter(
    (candidate) => candidate.status !== "dismissed",
  );
  const refreshedAt = formatRefreshedAt(state.inbox_refreshed_at ?? "");
  const hasSelectedJob = [
    state.target_title,
    state.job_url,
    state.research_summary,
    state.tailored_resume,
  ].some((value) => Boolean(value?.trim()));
  const hasMatch = Boolean(state.match_summary?.trim());
  const strengths = (state.strengths ?? []).filter((item) => item.trim());
  const gaps = (state.gaps ?? []).filter((item) => item.trim());
  const sources = (state.sources ?? []).filter(
    (source) => source.title.trim() && source.url.trim(),
  );
  const answers = (state.answers ?? []).filter(
    (answer) => answer.field.trim() && answer.answer.trim(),
  );

  return (
    <Artifact className="h-full rounded-none border-0 border-s" data-testid="jobs-artifact">
      <ArtifactHeader className="items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <ArtifactTitle>{view.title}</ArtifactTitle>
            <Badge variant="outline" className={statusMeta.className}>
              {statusMeta.label}
            </Badge>
          </div>
          <ArtifactDescription className="mt-1">
            Ranked openings, fit research, and a proposed resume — nothing is submitted
            automatically
          </ArtifactDescription>
        </div>
        <ArtifactActions>
          <ArtifactClose aria-label="Close job brief" onClick={onClose} />
        </ArtifactActions>
      </ArtifactHeader>

      <ArtifactContent className="p-0">
        <section className="border-b p-5" aria-labelledby="jobs-watchlist">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Inbox aria-hidden="true" className="size-4 text-page" />
                <h2 id="jobs-watchlist" className="text-lg font-semibold">
                  Job watchlist
                </h2>
              </div>
              {refreshedAt ? (
                <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock3 aria-hidden="true" className="size-3.5" />
                  Refreshed {refreshedAt}
                </p>
              ) : null}
            </div>
            {watchlist?.minimum_salary_usd ? (
              <Badge variant="outline">
                ${watchlist.minimum_salary_usd.toLocaleString()}+ minimum
              </Badge>
            ) : null}
          </div>

          {watchlistRoles.length ? (
            <>
              <div className="mt-4 flex flex-wrap gap-2">
                {watchlistRoles.map((role) => (
                  <Badge key={role} variant="secondary">
                    {role}
                  </Badge>
                ))}
                {watchlist?.remote_only ? <Badge variant="outline">Remote only</Badge> : null}
                {watchlistLocations.map((location) => (
                  <Badge key={location} variant="outline">
                    <MapPin aria-hidden="true" className="size-3" />
                    {location}
                  </Badge>
                ))}
              </div>
              {watchlistMustHave.length || watchlistExclude.length ? (
                <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                  {watchlistMustHave.length ? (
                    <p>
                      <span className="font-medium">Must have:</span>{" "}
                      <span className="text-muted-foreground">{watchlistMustHave.join(", ")}</span>
                    </p>
                  ) : null}
                  {watchlistExclude.length ? (
                    <p>
                      <span className="font-medium">Exclude:</span>{" "}
                      <span className="text-muted-foreground">{watchlistExclude.join(", ")}</span>
                    </p>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              Tell the agent which roles, locations, and constraints to watch.
            </p>
          )}

          {activeCandidates.length ? (
            <div className="mt-5">
              <h3 className="text-sm font-semibold">Ranked openings</h3>
              <div className="mt-3 flex flex-col gap-3">
                {activeCandidates.map((candidate) => {
                  const candidateStatus = CANDIDATE_STATUS_META[candidate.status];
                  return (
                    <article key={candidate.id || candidate.url} className="rounded-md border p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <a
                            href={candidate.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 font-semibold text-page hover:underline"
                          >
                            {candidate.title}
                            <ExternalLink aria-hidden="true" className="size-3.5" />
                          </a>
                          <p className="mt-0.5 text-sm text-muted-foreground">
                            {candidate.company} · {candidate.location}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="secondary">{candidate.match_score}/100</Badge>
                          <Badge variant="outline" className={candidateStatus.className}>
                            {candidateStatus.label}
                          </Badge>
                        </div>
                      </div>
                      <p className="mt-3 text-sm">{candidate.summary}</p>
                      {candidate.why_match.length ? (
                        <div className="mt-3">
                          <p className="text-xs font-medium text-muted-foreground">
                            Why it matches
                          </p>
                          <ul className="mt-1 text-sm">
                            {candidate.why_match.map((reason) => (
                              <li key={reason}>{reason}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      {candidate.concerns.length ? (
                        <div className="mt-3 rounded-md border border-amber-500/20 bg-amber-500/5 p-3">
                          <p className="flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-300">
                            <CircleAlert aria-hidden="true" className="size-3.5" />
                            Concerns to review
                          </p>
                          <ul className="mt-1 text-sm">
                            {candidate.concerns.map((concern) => (
                              <li key={concern}>{concern}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        {candidate.posted_at ? <span>Posted {candidate.posted_at}</span> : null}
                        {candidate.compensation ? <span>{candidate.compensation}</span> : null}
                        {candidate.sources.map((source) => (
                          <a
                            key={source.url}
                            href={source.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-page hover:underline"
                          >
                            {source.title}
                          </a>
                        ))}
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          ) : null}
        </section>

        {hasSelectedJob ? (
          <>
            <section className="border-b bg-page/10 p-5" aria-labelledby="jobs-target">
              <div className="mb-2 flex items-center gap-2 text-page">
                <BriefcaseBusiness aria-hidden="true" className="size-4" />
                <p className="text-xs font-semibold tracking-widest uppercase">
                  {state.company?.trim() ? state.company.trim() : "Target company"}
                </p>
              </div>
              <h2 id="jobs-target" className="text-xl leading-tight font-semibold">
                {state.target_title?.trim() ? state.target_title.trim() : "Role not selected"}
              </h2>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {hasMatch ? (
                  <>
                    <Badge variant="secondary">{state.match_score}/100 match</Badge>
                    <Badge variant="outline" className="capitalize">
                      {labelVerdict(state.match_verdict ?? "stretch")}
                    </Badge>
                  </>
                ) : null}
                {state.job_url?.trim() ? (
                  <a
                    href={state.job_url}
                    target="_blank"
                    rel="noreferrer"
                    className={buttonVariants({ variant: "link", size: "sm" })}
                  >
                    Original posting
                    <ExternalLink />
                  </a>
                ) : null}
              </div>
            </section>

            <div className="typeset typeset-site flex flex-col gap-8 p-5">
              <section aria-labelledby="jobs-research">
                <div className="mb-3 flex items-center gap-2">
                  <Search aria-hidden="true" className="size-4 text-page" />
                  <h3 id="jobs-research" className="mt-0">
                    Research brief
                  </h3>
                </div>
                {state.research_summary?.trim() ? (
                  <Streamdown>{state.research_summary}</Streamdown>
                ) : (
                  <p className="text-muted-foreground">
                    Company and role research will appear here.
                  </p>
                )}
                {sources.length ? (
                  <ul className="mt-4 flex list-none flex-col gap-2 p-0">
                    {sources.map((source) => (
                      <li key={source.url} className="mt-0 rounded-md border bg-muted/20 p-3">
                        <a
                          href={source.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 font-medium text-page hover:underline"
                        >
                          {source.title}
                          <ExternalLink aria-hidden="true" className="size-3.5" />
                        </a>
                        <p className="mt-1 text-sm text-muted-foreground">{source.summary}</p>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>

              <section aria-labelledby="jobs-fit">
                <div className="mb-3 flex items-center gap-2">
                  <Target aria-hidden="true" className="size-4 text-page" />
                  <h3 id="jobs-fit" className="mt-0">
                    Fit
                  </h3>
                </div>
                {hasMatch ? (
                  <Streamdown>{state.match_summary}</Streamdown>
                ) : (
                  <p className="text-muted-foreground">
                    The fit assessment follows the research pass.
                  </p>
                )}
                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 p-3">
                    <div className="mb-2 flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
                      <CheckCircle2 aria-hidden="true" className="size-4" />
                      <h4 className="mt-0">Documented strengths</h4>
                    </div>
                    {strengths.length ? (
                      <ul className="mt-0">
                        {strengths.map((strength) => (
                          <li key={strength}>{strength}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-muted-foreground">Analysis in progress.</p>
                    )}
                  </div>
                  <div className="rounded-md border border-amber-500/20 bg-amber-500/5 p-3">
                    <div className="mb-2 flex items-center gap-2 text-amber-700 dark:text-amber-300">
                      <CircleAlert aria-hidden="true" className="size-4" />
                      <h4 className="mt-0">Evidence gaps</h4>
                    </div>
                    {gaps.length ? (
                      <ul className="mt-0">
                        {gaps.map((gap) => (
                          <li key={gap}>{gap}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        {hasMatch ? "No material evidence gaps recorded." : "Analysis in progress."}
                      </p>
                    )}
                  </div>
                </div>
              </section>

              <section aria-labelledby="jobs-resume">
                <div className="mb-3 flex items-center gap-2">
                  <FileText aria-hidden="true" className="size-4 text-page" />
                  <h3 id="jobs-resume" className="mt-0">
                    Proposed tailored resume
                  </h3>
                </div>
                {state.tailored_resume?.trim() ? (
                  <div className="rounded-md border bg-background p-4">
                    <Streamdown>{state.tailored_resume}</Streamdown>
                  </div>
                ) : (
                  <p className="rounded-md border border-dashed p-3 text-muted-foreground">
                    The proposed resume will appear after fit analysis.
                  </p>
                )}
              </section>

              {answers.length ? (
                <section aria-labelledby="jobs-answers">
                  <div className="mb-3 flex items-center gap-2">
                    <ShieldAlert aria-hidden="true" className="size-4 text-page" />
                    <h3 id="jobs-answers" className="mt-0">
                      Optional application answers
                    </h3>
                  </div>
                  <div className="flex flex-col gap-3">
                    {answers.map((answer) => (
                      <article key={answer.field} className="rounded-md border p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h4 className="mt-0">{answer.field}</h4>
                            {answer.sensitive ? (
                              <Badge variant="outline" className="mt-1">
                                Sensitive — verify
                              </Badge>
                            ) : null}
                          </div>
                          <CopyAnswer field={answer.field} answer={answer.answer} />
                        </div>
                        <p className="mt-3 whitespace-pre-wrap">{answer.answer}</p>
                        <p className="mt-2 text-xs text-muted-foreground">
                          Evidence: {answer.evidence}
                        </p>
                      </article>
                    ))}
                  </div>
                </section>
              ) : null}

              {state.review_summary?.trim() ? (
                <section className="border-t pt-4" aria-labelledby="jobs-review">
                  <h3
                    id="jobs-review"
                    className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
                  >
                    Review note
                  </h3>
                  <p className="text-muted-foreground">{state.review_summary}</p>
                </section>
              ) : null}
            </div>
          </>
        ) : null}
      </ArtifactContent>
    </Artifact>
  );
}
