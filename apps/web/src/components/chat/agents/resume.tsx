"use client";

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

const STATUS_META: Record<ResumeStatus, { label: string; className: string }> = {
  idle: {
    label: "Waiting for role",
    className: "border-border bg-muted/50 text-muted-foreground",
  },
  analyzing: {
    label: "Analyzing",
    className:
      "border-[color-mix(in_srgb,var(--page-color)_35%,transparent)] bg-[color-mix(in_srgb,var(--page-color)_10%,transparent)] text-[var(--page-color)]",
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
    <Artifact className="h-full rounded-none border-0 border-l" data-testid="resume-artifact">
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
        <section
          aria-labelledby="resume-target-role"
          className="border-b bg-[color-mix(in_srgb,var(--page-color)_7%,transparent)] px-5 py-5"
        >
          <div className="mb-2 flex items-center gap-2 text-[var(--page-color)]">
            <Target aria-hidden="true" className="size-4" />
            <p className="text-xs font-semibold tracking-[0.16em] uppercase">Target role</p>
          </div>
          <h2 id="resume-target-role" className="text-xl leading-tight font-semibold">
            {targetRole}
          </h2>
          {state.job_description?.trim() ? (
            <p className="text-muted-foreground mt-2 line-clamp-4 text-sm leading-relaxed whitespace-pre-wrap">
              {state.job_description}
            </p>
          ) : null}
        </section>

        <div className="space-y-7 p-5">
          <section aria-labelledby="resume-fit-summary">
            <div className="mb-3 flex items-center gap-2">
              <Sparkles aria-hidden="true" className="size-4 text-[var(--page-color)]" />
              <h3 id="resume-fit-summary" className="text-sm font-semibold">
                Fit summary
              </h3>
            </div>
            <div className="prose prose-sm dark:prose-invert max-w-none">
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
              <span className="text-muted-foreground text-xs tabular-nums">{gaps.length}</span>
            </div>
            {gaps.length ? (
              <ul className="space-y-2">
                {gaps.map(({ item, key }) => (
                  <li
                    key={key}
                    className="border-border/70 bg-muted/25 rounded-md border px-3 py-2.5 text-sm leading-relaxed"
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
                <CheckCircle2 aria-hidden="true" className="size-4 text-[var(--page-color)]" />
                <h3 id="resume-tailored-bullets" className="text-sm font-semibold">
                  Tailored evidence
                </h3>
              </div>
              <span className="text-muted-foreground text-xs tabular-nums">
                {tailoredBullets.length}
              </span>
            </div>
            {tailoredBullets.length ? (
              <ul className="space-y-2.5">
                {tailoredBullets.map(({ item, key }) => (
                  <li key={key} className="flex gap-3 text-sm leading-relaxed">
                    <span
                      aria-hidden="true"
                      className="mt-2 size-1.5 shrink-0 rounded-full bg-[var(--page-color)]"
                    />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground rounded-md border border-dashed px-3 py-3 text-sm">
                Tailored evidence will appear when the role analysis is complete.
              </p>
            )}
          </section>

          {state.review_summary?.trim() ? (
            <section aria-labelledby="resume-review" className="border-t pt-4">
              <h3
                id="resume-review"
                className="text-muted-foreground mb-1 text-xs font-semibold tracking-wide uppercase"
              >
                Ready check
              </h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                {state.review_summary}
              </p>
            </section>
          ) : null}
        </div>
      </ArtifactContent>
    </Artifact>
  );
}
