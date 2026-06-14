"use client";

import { useEffect, useState } from "react";
import { Streamdown } from "streamdown";
import { Maximize2Icon, Minimize2Icon, PlayIcon, SquareIcon } from "lucide-react";

import type { CaseSource, OralBoardsExchange, OralBoardsState } from "@agents/types";
import { Button } from "@agents/ui";
import {
  Artifact,
  ArtifactActions,
  ArtifactAction,
  ArtifactClose,
  ArtifactContent,
  ArtifactHeader,
  ArtifactTitle,
} from "@/components/ai-elements/artifact";
import { speak, stopSpeaking } from "@/lib/copilotkit/speak-question";
import { useCurrentQuestion } from "@/lib/copilotkit/oral-boards-question";
import { tabForStatus, type OralBoardsTab } from "./tab-for-status";

const CASE_SPEED = 0.8;

function CitationChips({ sources }: { sources: CaseSource[] }) {
  if (sources.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {sources.map((s) => (
        <span
          key={`${s.collection}-${s.docid}`}
          className="bg-muted text-muted-foreground rounded-md px-1.5 py-0.5 text-[11px]"
        >
          {s.collection} #{s.docid} · {s.title}
        </span>
      ))}
    </div>
  );
}

function CaseVignette({ caseBody, sources }: { caseBody: string; sources: CaseSource[] }) {
  const [open, setOpen] = useState(true);
  const [playing, setPlaying] = useState(false);

  const present = () => {
    if (playing) {
      stopSpeaking();
      setPlaying(false);
      return;
    }
    setPlaying(true);
    void speak(caseBody, { speed: CASE_SPEED }).finally(() => setPlaying(false));
  };

  return (
    <section className="border-border rounded-lg border p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-muted-foreground text-xs font-medium tracking-wide uppercase"
        >
          {open ? "▾" : "▸"} Case vignette
        </button>
        <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={present}>
          {playing ? <SquareIcon className="size-3.5" /> : <PlayIcon className="size-3.5" />}
          {playing ? "Stop" : "Present case"}
        </Button>
      </div>
      {open && (
        <div className="space-y-2">
          <Streamdown>{caseBody}</Streamdown>
          <CitationChips sources={sources} />
        </div>
      )}
    </section>
  );
}

function QuestionView({ fallback }: { fallback: string }) {
  const live = useCurrentQuestion();
  const question = live || fallback;
  return (
    <div className="space-y-1">
      <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        Current question
      </p>
      <p className="text-sm leading-relaxed">{question || "Waiting for the next question…"}</p>
    </div>
  );
}

function FeedbackView({
  scoreCard,
  transcript,
}: {
  scoreCard: string;
  transcript: OralBoardsExchange[];
}) {
  return (
    <div className="space-y-4">
      {scoreCard.trim() && <Streamdown>{scoreCard}</Streamdown>}
      {transcript.map((x, i) => (
        <div key={x.question || i} className="border-border space-y-1 border-t pt-3 text-sm">
          <p className="font-medium">
            Q{i + 1}. {x.question}
          </p>
          {x.answer && <p className="text-muted-foreground">Your answer: {x.answer}</p>}
          {x.feedback && <p>{x.feedback}</p>}
          <CitationChips sources={x.citations ?? []} />
        </div>
      ))}
      {!scoreCard.trim() && transcript.length === 0 && (
        <p className="text-muted-foreground text-sm">No feedback yet.</p>
      )}
    </div>
  );
}

export function OralBoardsPanel({
  state,
  fullscreen,
  onClose,
  onToggleFullscreen,
}: {
  state: OralBoardsState;
  fullscreen: boolean;
  onClose: () => void;
  onToggleFullscreen: () => void;
}) {
  const phaseTab = tabForStatus(state.status ?? state.phase);
  const [tab, setTab] = useState<OralBoardsTab>(phaseTab);
  // Auto-follow the phase; manual selection sticks until the phase changes again.
  useEffect(() => setTab(phaseTab), [phaseTab]);

  const transcript = state.transcript ?? [];
  const lastQuestion = transcript.at(-1)?.question ?? "";

  return (
    <Artifact className="h-full rounded-none border-0 border-l">
      <ArtifactHeader>
        <ArtifactTitle>Oral board</ArtifactTitle>
        <ArtifactActions>
          <ArtifactAction
            icon={fullscreen ? Minimize2Icon : Maximize2Icon}
            tooltip={fullscreen ? "Restore split" : "Fullscreen"}
            onClick={onToggleFullscreen}
          />
          <ArtifactClose aria-label="Close panel" onClick={onClose} />
        </ArtifactActions>
      </ArtifactHeader>
      <ArtifactContent className="space-y-3">
        <CaseVignette caseBody={state.case ?? ""} sources={state.case_sources ?? []} />
        <div className="flex gap-1 text-xs">
          {(["question", "feedback"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={
                tab === t
                  ? "bg-primary rounded-md px-2 py-1 text-white capitalize"
                  : "text-muted-foreground rounded-md px-2 py-1 capitalize"
              }
            >
              {t}
            </button>
          ))}
        </div>
        {tab === "question" ? (
          <QuestionView fallback={lastQuestion} />
        ) : (
          <FeedbackView scoreCard={state.score_card ?? ""} transcript={transcript} />
        )}
      </ArtifactContent>
    </Artifact>
  );
}
