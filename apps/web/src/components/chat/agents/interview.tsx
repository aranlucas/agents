"use client";

import {
  Artifact,
  ArtifactActions,
  ArtifactClose,
  ArtifactContent,
  ArtifactDescription,
  ArtifactHeader,
  ArtifactTitle,
  Badge,
  Progress,
  ProgressLabel,
  ProgressValue,
  Streamdown,
} from "@agents/ui";
import {
  ArrowUpRight,
  BrainCircuit,
  CheckCircle2,
  Code2,
  Lightbulb,
  MessageSquareText,
  Target,
} from "lucide-react";

import { toInterviewState } from "@/lib/agent-state";

import type { AgentArtifactProps } from "./extensions";

const STATUS_META = {
  idle: {
    label: "Ready to configure",
    className: "border-border bg-muted/50 text-muted-foreground",
  },
  practicing: {
    label: "Interview in progress",
    className: "border-interview/30 bg-interview/10 text-interview",
  },
  feedback: {
    label: "Feedback ready",
    className: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  },
  complete: {
    label: "Session complete",
    className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
} as const;

function humanize(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function InterviewArtifact({ state: rawState, view, onClose }: AgentArtifactProps) {
  const state = toInterviewState(rawState);
  const status = state.status ?? "idle";
  const statusMeta = STATUS_META[status];
  const completed = state.completed_count ?? 0;
  const target = state.target_question_count ?? 0;
  const progress = target > 0 ? Math.min(100, Math.round((completed / target) * 100)) : 0;
  const question = state.current_question;
  const feedback = state.active_feedback;
  const TrackIcon =
    state.track === "coding"
      ? Code2
      : state.track === "behavioral"
        ? MessageSquareText
        : BrainCircuit;

  return (
    <Artifact className="h-full rounded-none border-0 border-s" data-testid="interview-artifact">
      <ArtifactHeader className="items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <ArtifactTitle>{view.title}</ArtifactTitle>
            <Badge variant="outline" className={statusMeta.className}>
              {statusMeta.label}
            </Badge>
          </div>
          <ArtifactDescription className="mt-1">
            One question at a time, with evidence-based feedback
          </ArtifactDescription>
        </div>
        <ArtifactActions>
          <ArtifactClose aria-label="Close practice board" onClick={onClose} />
        </ArtifactActions>
      </ArtifactHeader>

      <ArtifactContent className="p-0">
        <section className="border-b bg-interview/10 p-5" aria-labelledby="interview-session">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-interview text-white dark:text-interview-contrast">
              <TrackIcon aria-hidden="true" className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold tracking-widest text-interview uppercase">
                {state.track ? `${humanize(state.track)} practice` : "Interview practice"}
              </p>
              <h2 id="interview-session" className="mt-1 text-xl leading-tight font-semibold">
                {state.target_role?.trim() ? state.target_role.trim() : "Choose a practice track"}
              </h2>
              <div className="mt-2 flex flex-wrap gap-2">
                {state.target_level ? (
                  <Badge variant="secondary">{humanize(state.target_level)} level</Badge>
                ) : null}
                {state.difficulty ? (
                  <Badge variant="secondary">{humanize(state.difficulty)}</Badge>
                ) : null}
                {state.coaching_style ? (
                  <Badge variant="outline">{humanize(state.coaching_style)} style</Badge>
                ) : null}
              </div>
            </div>
          </div>

          {target > 0 ? (
            <Progress value={progress} className="mt-5">
              <ProgressLabel>Session progress</ProgressLabel>
              <ProgressValue>{() => `${completed}/${target} questions`}</ProgressValue>
            </Progress>
          ) : null}
        </section>

        <div className="typeset typeset-site flex flex-col gap-8 p-5">
          {status === "idle" ? (
            <section className="rounded-md border border-dashed p-6 text-center">
              <BrainCircuit aria-hidden="true" className="mx-auto size-7 text-interview" />
              <h3 className="mt-3">Start a practice session</h3>
              <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                Ask for a behavioral interview or choose a coding topic and difficulty. The coach
                will set up the loop and keep score here.
              </p>
            </section>
          ) : null}

          {question ? (
            <section aria-labelledby="interview-question">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Target aria-hidden="true" className="size-4 text-interview" />
                <p className="text-xs font-semibold tracking-widest text-interview uppercase">
                  Current question
                </p>
                <Badge variant="outline">{question.topic}</Badge>
              </div>
              <h3 id="interview-question" className="mt-0">
                {question.title}
              </h3>
              <p className="mt-3 text-base leading-relaxed">{question.prompt}</p>

              {question.examples.length ? (
                <div className="mt-5 rounded-md border bg-muted/30 p-4">
                  <h4 className="mt-0 text-sm">Examples</h4>
                  <ul className="mt-2">
                    {question.examples.map((example) => (
                      <li key={example}>
                        <code className="text-sm">{example}</code>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {question.constraints.length ? (
                <div className="mt-4">
                  <h4 className="mt-0 text-sm">Constraints</h4>
                  <ul className="mt-2 text-sm text-muted-foreground">
                    {question.constraints.map((constraint) => (
                      <li key={constraint}>{constraint}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>
          ) : null}

          {state.active_hint?.trim() ? (
            <section
              className="rounded-md border border-amber-500/25 bg-amber-500/5 p-4"
              aria-labelledby="interview-hint"
            >
              <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
                <Lightbulb aria-hidden="true" className="size-4" />
                <h3 id="interview-hint" className="mt-0">
                  Hint {state.hint_level}
                </h3>
              </div>
              <p className="mt-2">{state.active_hint}</p>
            </section>
          ) : null}

          {feedback ? (
            <section aria-labelledby="interview-feedback">
              <div className="mb-3 flex items-center gap-2">
                <CheckCircle2 aria-hidden="true" className="size-4 text-interview" />
                <h3 id="interview-feedback" className="mt-0">
                  Feedback
                </h3>
                <Badge variant="secondary">{feedback.overall_score.toFixed(1)}/5</Badge>
              </div>
              <Streamdown>{feedback.feedback}</Streamdown>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {feedback.rubric.map((score) => (
                  <div key={score.dimension} className="rounded-md border bg-muted/20 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <h4 className="mt-0 text-sm">{humanize(score.dimension)}</h4>
                      <Badge variant="outline">{score.score}/5</Badge>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">{score.evidence}</p>
                  </div>
                ))}
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 p-4">
                  <h4 className="mt-0 text-emerald-700 dark:text-emerald-300">What worked</h4>
                  <ul className="mt-2">
                    {feedback.strengths.map((strength) => (
                      <li key={strength}>{strength}</li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-md border border-sky-500/20 bg-sky-500/5 p-4">
                  <h4 className="mt-0 text-sky-700 dark:text-sky-300">Improve next</h4>
                  <ul className="mt-2">
                    {feedback.improvements.map((improvement) => (
                      <li key={improvement}>{improvement}</li>
                    ))}
                  </ul>
                </div>
              </div>

              {feedback.follow_up ? (
                <div className="mt-5 flex gap-3 rounded-md border p-4">
                  <ArrowUpRight
                    aria-hidden="true"
                    className="mt-1 size-4 shrink-0 text-interview"
                  />
                  <div>
                    <h4 className="mt-0">Follow-up</h4>
                    <p className="mt-1">{feedback.follow_up}</p>
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}

          {status === "complete" ? (
            <section aria-labelledby="interview-summary">
              <div className="mb-3 flex items-center gap-2">
                <BrainCircuit aria-hidden="true" className="size-4 text-interview" />
                <h3 id="interview-summary" className="mt-0">
                  Session summary
                </h3>
                <Badge variant="secondary">{(state.average_score ?? 0).toFixed(1)}/5 average</Badge>
              </div>
              {state.session_summary ? (
                <Streamdown>{state.session_summary}</Streamdown>
              ) : (
                <p className="text-muted-foreground">Summary in progress.</p>
              )}
              {state.next_steps?.length ? (
                <div className="mt-5">
                  <h4 className="mt-0">Next practice</h4>
                  <ul className="mt-2">
                    {state.next_steps.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>
          ) : null}

          {state.history && state.history.length > 1 ? (
            <section aria-labelledby="interview-history">
              <h3 id="interview-history" className="mt-0">
                Question history
              </h3>
              <ol className="mt-3">
                {state.history.map((entry) => (
                  <li key={entry.question_id}>
                    <span className="font-medium">{entry.question_title}</span>
                    <span className="ms-2 text-sm text-muted-foreground">
                      {entry.overall_score.toFixed(1)}/5
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}
        </div>
      </ArtifactContent>
    </Artifact>
  );
}
