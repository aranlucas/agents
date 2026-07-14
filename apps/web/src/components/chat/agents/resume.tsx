"use client";

import { useConfigureSuggestions } from "@copilotkit/react-core/v2";
import type { ResumeStatus } from "@agents/types";
import {
  Artifact,
  ArtifactActions,
  ArtifactClose,
  ArtifactContent,
  ArtifactDescription,
  ArtifactHeader,
  ArtifactTitle,
  Badge,
  Streamdown,
} from "@agents/ui";
import { CheckCircle2, CircleAlert, Sparkles, Target } from "lucide-react";

import { toResumeState } from "@/lib/agent-state";

import type { AgentArtifactProps } from "./extensions";
import type { AgentId } from "./registry";

const RESUME_SUGGESTIONS = [
  {
    title: "Why personal agents?",
    message:
      "Why does Lucas build personal agents for his own life, and how has that shaped his professional work?",
  },
  {
    title: "From idea to launch",
    message: "How does Lucas take an agent idea from a personal experiment to a product launch?",
  },
  {
    title: "AI product experience",
    message: "What has Lucas shipped across AI products, agent platforms, and user experiences?",
  },
  {
    title: "Assess a role",
    message: "I want to assess Lucas's fit for a role. What details do you need from me?",
  },
];

const STATUS_META: Record<ResumeStatus, { label: string; className: string }> = {
  idle: {
    label: "Waiting for role",
    className: "border-border bg-muted/50 text-muted-foreground",
  },
  analyzing: {
    label: "Analyzing",
    className: "border-page/35 bg-page/10 text-page",
  },
  ready: {
    label: "Ready",
    className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
};

function keyedItems(items: string[]) {
  const counts = new Map<string, number>();
  return items.map((item) => {
    const count = counts.get(item) ?? 0;
    counts.set(item, count + 1);
    return { item, key: count === 0 ? item : `${item}-${count}` };
  });
}

function nonBlank(value: string | undefined, fallback: string) {
  const trimmed = value?.trim();
  if (!trimmed) return fallback;
  return trimmed;
}

export function ResumeExtension({ agentId }: { agentId: AgentId }) {
  useConfigureSuggestions({
    suggestions: RESUME_SUGGESTIONS,
    consumerAgentId: agentId,
    available: "before-first-message",
  });
  return null;
}

export function ResumeArtifact({ state: rawState, view, onClose }: AgentArtifactProps) {
  const state = toResumeState(rawState);
  const status = state.status ?? "idle";
  const statusMeta = STATUS_META[status];
  const fitSummary = nonBlank(state.fit_summary, view.content);
  const targetRole = nonBlank(state.target_role, "Role not specified");
  const gaps = keyedItems((state.gaps ?? []).filter((gap) => gap.trim()));
  const tailoredBullets = keyedItems(
    (state.tailored_bullets ?? []).filter((bullet) => bullet.trim()),
  );

  return (
    <Artifact className="h-full rounded-none border-0 border-s" data-testid="resume-artifact">
      <ArtifactHeader className="items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <ArtifactTitle>{view.title}</ArtifactTitle>
            <Badge variant="outline" className={statusMeta.className}>
              {statusMeta.label}
            </Badge>
          </div>
          <ArtifactDescription className="mt-1">
            {`v${view.version} · grounded in the source resume`}
          </ArtifactDescription>
        </div>
        <ArtifactActions>
          <ArtifactClose aria-label="Close role fit brief" onClick={onClose} />
        </ArtifactActions>
      </ArtifactHeader>

      <ArtifactContent className="p-0">
        <section aria-labelledby="resume-target-role" className="border-b bg-page/10 p-5">
          <div className="mb-2 flex items-center gap-2 text-page">
            <Target aria-hidden="true" className="size-4" />
            <p className="text-xs font-semibold tracking-widest uppercase">Target role</p>
          </div>
          <h2 id="resume-target-role" className="text-xl leading-tight font-semibold">
            {targetRole}
          </h2>
          {state.job_description?.trim() ? (
            <p className="mt-2 line-clamp-4 text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground">
              {state.job_description}
            </p>
          ) : null}
        </section>

        <div className="flex flex-col gap-7 p-5">
          <section aria-labelledby="resume-fit-summary">
            <div className="mb-3 flex items-center gap-2">
              <Sparkles aria-hidden="true" className="size-4 text-page" />
              <h3 id="resume-fit-summary" className="text-sm font-semibold">
                Fit summary
              </h3>
            </div>
            <div className="prose prose-sm max-w-none dark:prose-invert">
              <Streamdown>{fitSummary}</Streamdown>
            </div>
          </section>

          <section aria-labelledby="resume-gaps">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <CircleAlert aria-hidden="true" className="size-4 text-amber-600" />
                <h3 id="resume-gaps" className="text-sm font-semibold">
                  Gaps to address
                </h3>
              </div>
              <span className="text-xs text-muted-foreground tabular-nums">{gaps.length}</span>
            </div>
            {gaps.length ? (
              <ul className="flex flex-col gap-2">
                {gaps.map(({ item, key }) => (
                  <li
                    key={key}
                    className="rounded-md border border-border/70 bg-muted/25 px-3 py-2.5 text-sm leading-relaxed"
                  >
                    {item}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex items-center gap-2 rounded-md border border-emerald-500/20 bg-emerald-500/5 px-3 py-2.5 text-sm text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 aria-hidden="true" className="size-4 shrink-0" />
                <p>
                  {status === "ready"
                    ? "No material gaps identified."
                    : "Gap analysis is in progress."}
                </p>
              </div>
            )}
          </section>

          <section aria-labelledby="resume-tailored-bullets">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 aria-hidden="true" className="size-4 text-page" />
                <h3 id="resume-tailored-bullets" className="text-sm font-semibold">
                  Tailored evidence
                </h3>
              </div>
              <span className="text-xs text-muted-foreground tabular-nums">
                {tailoredBullets.length}
              </span>
            </div>
            {tailoredBullets.length ? (
              <ul className="flex flex-col gap-2.5">
                {tailoredBullets.map(({ item, key }) => (
                  <li key={key} className="flex gap-3 text-sm leading-relaxed">
                    <span
                      aria-hidden="true"
                      className="mt-2 size-1.5 shrink-0 rounded-full bg-page"
                    />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                Tailored evidence will appear when the role analysis is complete.
              </p>
            )}
          </section>

          {state.review_summary?.trim() ? (
            <section aria-labelledby="resume-review" className="border-t pt-4">
              <h3
                id="resume-review"
                className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
              >
                Ready check
              </h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {state.review_summary}
              </p>
            </section>
          ) : null}
        </div>
      </ArtifactContent>
    </Artifact>
  );
}
