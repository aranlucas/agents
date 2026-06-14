"use client";

import { useState } from "react";
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

function stripMarkdownForSpeech(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, "") // headers → bare text
    .replace(/\*{1,3}([^*]+)\*{1,3}/g, "$1") // bold / italic
    .replace(/_{1,3}([^_]+)_{1,3}/g, "$1") // underscore emphasis
    .replace(/`+([^`]+)`+/g, "$1") // inline code
    .replace(/^>\s*/gm, "") // blockquotes
    .replace(/^[-*+]\s+/gm, "") // unordered lists
    .replace(/^\d+\.\s+/gm, "") // ordered lists
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // links → link text
    .replace(/\[[^\]]*\]/g, "") // remaining brackets (inline citations)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

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

function VignetteBody({
  caseBody,
  sources,
  showTts = true,
}: {
  caseBody: string;
  sources: CaseSource[];
  showTts?: boolean;
}) {
  const [playing, setPlaying] = useState(false);

  const toggle = () => {
    if (playing) {
      stopSpeaking();
      setPlaying(false);
      return;
    }
    setPlaying(true);
    void speak(stripMarkdownForSpeech(caseBody)).finally(() => setPlaying(false));
  };

  return (
    <div className="space-y-2">
      {showTts && (
        <div className="flex justify-end">
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={toggle}>
            {playing ? <SquareIcon className="size-3.5" /> : <PlayIcon className="size-3.5" />}
            {playing ? "Stop" : "Present case"}
          </Button>
        </div>
      )}
      <Streamdown>{caseBody}</Streamdown>
      <CitationChips sources={sources} />
    </div>
  );
}

function ExchangeList({ transcript }: { transcript: OralBoardsExchange[] }) {
  return (
    <>
      {transcript.map((x, i) => (
        <div key={x.question || i} className="border-border space-y-1 border-t pt-3 text-sm">
          <p className="font-medium">
            Q{i + 1}. {x.question}
          </p>
          {x.answer && <p className="text-muted-foreground">Your answer: {x.answer}</p>}
          {x.feedback && <Streamdown>{x.feedback}</Streamdown>}
          <CitationChips sources={x.citations ?? []} />
        </div>
      ))}
    </>
  );
}

function PresentingPane({
  caseBody,
  sources,
  onReady,
}: {
  caseBody: string;
  sources: CaseSource[];
  onReady: () => void;
}) {
  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex-1 overflow-auto">
        <VignetteBody caseBody={caseBody} sources={sources} />
      </div>
      <Button type="button" className="w-full shrink-0" onClick={onReady}>
        Ready to begin
      </Button>
    </div>
  );
}

function QuestioningPane({
  caseBody,
  sources,
  transcript,
}: {
  caseBody: string;
  sources: CaseSource[];
  transcript: OralBoardsExchange[];
}) {
  const live = useCurrentQuestion();
  const question = live || transcript.at(-1)?.question || "";

  return (
    <div className="space-y-4">
      <details>
        <summary className="text-muted-foreground cursor-pointer text-xs font-medium tracking-wide uppercase select-none">
          Case vignette
        </summary>
        <div className="mt-2">
          <VignetteBody caseBody={caseBody} sources={sources} />
        </div>
      </details>

      <div className="space-y-1">
        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          Current question
        </p>
        <p className="text-sm leading-relaxed">{question || "Waiting for the next question…"}</p>
      </div>

      <ExchangeList transcript={transcript} />
    </div>
  );
}

function FeedbackPane({
  scoreCard,
  transcript,
}: {
  scoreCard: string;
  transcript: OralBoardsExchange[];
}) {
  return (
    <div className="space-y-4">
      {scoreCard.trim() && <Streamdown>{scoreCard}</Streamdown>}
      <ExchangeList transcript={transcript} />
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
  onReady,
}: {
  state: OralBoardsState;
  fullscreen: boolean;
  onClose: () => void;
  onToggleFullscreen: () => void;
  onReady: () => void;
}) {
  const status = state.status ?? "idle";
  const caseBody = state.case ?? "";
  const sources = state.case_sources ?? [];
  const transcript = state.transcript ?? [];
  const scoreCard = state.score_card ?? "";

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
      <ArtifactContent className={status === "presenting" ? "flex h-full flex-col" : "space-y-4"}>
        {status === "presenting" && (
          <PresentingPane caseBody={caseBody} sources={sources} onReady={onReady} />
        )}
        {status === "questioning" && (
          <QuestioningPane caseBody={caseBody} sources={sources} transcript={transcript} />
        )}
        {(status === "complete" || status === "feedback") && (
          <FeedbackPane scoreCard={scoreCard} transcript={transcript} />
        )}
      </ArtifactContent>
    </Artifact>
  );
}
