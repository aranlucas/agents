"use client";

import { useCallback, useRef, useState } from "react";
import { Streamdown } from "streamdown";
import {
  AlertCircleIcon,
  BookOpenIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  Loader2Icon,
  Maximize2Icon,
  Minimize2Icon,
  MicIcon,
  PlayIcon,
  SquareIcon,
} from "lucide-react";
import { CopilotChatAudioRecorder } from "@copilotkit/react-core/v2";

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
import { useOralBoardsQuestion } from "@/lib/copilotkit/oral-boards-question-context";
import { useAnswerRecorder } from "@/lib/copilotkit/use-answer-recorder";
import type { UseAnswerRecorder } from "@/lib/copilotkit/use-answer-recorder";

function truncate(text: string, len: number): string {
  return text.length <= len ? text : `${text.slice(0, len)}…`;
}

function stripMarkdownForSpeech(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*{1,3}([^*]+)\*{1,3}/g, "$1")
    .replace(/_{1,3}([^_]+)_{1,3}/g, "$1")
    .replace(/`+([^`]+)`+/g, "$1")
    .replace(/^>\s*/gm, "")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/^\d+\.\s+/gm, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\[[^\]]*\]/g, "")
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
          className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 font-mono text-[10px]"
        >
          {s.collection.toUpperCase()} #{s.docid} · {s.title}
        </span>
      ))}
    </div>
  );
}

function RecordButton({ recorder }: { recorder: UseAnswerRecorder }) {
  const { recording, transcribing, micSupported, error, clearError, toggle } = recorder;
  if (!micSupported) return null;
  return (
    <div className="flex items-center gap-2">
      {error && (
        <span className="flex items-center gap-1 text-xs text-red-500">
          <AlertCircleIcon className="size-3" />
          {error}
          <button type="button" onClick={clearError} className="ml-1 underline">
            Dismiss
          </button>
        </span>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => void toggle()}
        disabled={transcribing}
        className={recording ? "border-red-500 text-red-500" : ""}
      >
        {transcribing ? (
          <Loader2Icon className="size-3.5 animate-spin" />
        ) : recording ? (
          <>
            <span className="mr-1.5 inline-block size-2 animate-pulse rounded-full bg-red-500" />
            Stop
          </>
        ) : (
          <>
            <MicIcon className="mr-1 size-3.5" />
            Record
          </>
        )}
      </Button>
    </div>
  );
}

function TtsButton({ text, label = "Listen" }: { text: string; label?: string }) {
  const [playing, setPlaying] = useState(false);
  const toggle = () => {
    if (playing) {
      stopSpeaking();
      setPlaying(false);
      return;
    }
    setPlaying(true);
    void speak(stripMarkdownForSpeech(text)).finally(() => setPlaying(false));
  };
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-7 gap-1.5 px-2 text-xs"
      onClick={toggle}
    >
      {playing ? <SquareIcon className="size-3" /> : <PlayIcon className="size-3" />}
      {playing ? "Stop" : label}
    </Button>
  );
}

// Permanent left column during questioning — the vignette is always in view
function VignettePanel({
  caseBody,
  sources,
  width,
}: {
  caseBody: string;
  sources: CaseSource[];
  width: number;
}) {
  return (
    <div
      className="bg-muted/25 flex shrink-0 flex-col gap-4 overflow-y-auto border-r px-5 py-4"
      style={{ width: `${width}%` }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <BookOpenIcon className="size-3 text-indigo-400" />
          <span className="text-[10px] font-semibold tracking-[0.15em] text-indigo-400 uppercase">
            Case Vignette
          </span>
        </div>
        <TtsButton text={caseBody} label="Listen" />
      </div>
      <div className="text-[13px] leading-[1.7]">
        <Streamdown>{caseBody}</Streamdown>
      </div>
      {sources.length > 0 && (
        <div className="mt-auto border-t pt-3">
          <p className="text-muted-foreground mb-1.5 text-[10px] font-medium tracking-wide uppercase">
            Sources
          </p>
          <CitationChips sources={sources} />
        </div>
      )}
    </div>
  );
}

function CompletedExchangeRow({
  exchange,
  index,
}: {
  exchange: OralBoardsExchange;
  index: number;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="overflow-hidden rounded-lg border border-emerald-800/30 bg-emerald-950/10">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-emerald-950/20"
      >
        <CheckCircle2Icon className="size-3 shrink-0 text-emerald-400" />
        <span className="font-medium text-emerald-300/90">Q{index + 1}</span>
        <span className="text-muted-foreground flex-1 truncate">
          {truncate(exchange.question, 52)}
        </span>
        <ChevronDownIcon
          className={`text-muted-foreground size-3 transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </button>
      {expanded && (
        <div className="space-y-1.5 border-t border-emerald-800/20 px-3 py-2.5 text-xs">
          <p className="text-sm font-medium">{exchange.question}</p>
          {exchange.answer && (
            <p className="text-muted-foreground">
              <span className="text-foreground/60 font-medium">Your answer: </span>
              {exchange.answer}
            </p>
          )}
          {exchange.feedback && <Streamdown>{exchange.feedback}</Streamdown>}
          <CitationChips sources={exchange.citations ?? []} />
        </div>
      )}
    </div>
  );
}

function LastFeedbackCard({ exchange, index }: { exchange: OralBoardsExchange; index: number }) {
  return (
    <div className="shrink-0 space-y-1.5 rounded-lg border border-emerald-800/30 bg-emerald-950/10 px-3 py-3 text-sm">
      <p className="text-[10px] font-semibold tracking-[0.15em] text-emerald-400 uppercase">
        Q{index + 1} · Feedback
      </p>
      <p className="font-medium">{exchange.question}</p>
      {exchange.answer && (
        <p className="text-muted-foreground text-xs">Your answer: {exchange.answer}</p>
      )}
      {exchange.feedback && <Streamdown>{exchange.feedback}</Streamdown>}
      <CitationChips sources={exchange.citations ?? []} />
    </div>
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
  const [notes, setNotes] = useState("");
  const recorder = useAnswerRecorder((text) =>
    setNotes((prev) => (prev ? `${prev} ${text}` : text)),
  );

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex shrink-0 items-center justify-between">
        <p className="text-muted-foreground text-xs">
          Read and analyze the case. Take notes before beginning.
        </p>
        <TtsButton text={caseBody} label="Present case" />
      </div>

      <div className="bg-muted/20 flex-1 overflow-auto rounded-lg border p-5">
        <div className="text-[13.5px] leading-[1.75]">
          <Streamdown>{caseBody}</Streamdown>
        </div>
        {sources.length > 0 && (
          <div className="mt-4 border-t pt-3">
            <CitationChips sources={sources} />
          </div>
        )}
      </div>

      <div className="shrink-0 space-y-2">
        <p className="text-muted-foreground text-[10px] font-semibold tracking-[0.15em] uppercase">
          Your Notes
        </p>
        {recorder.micSupported && <CopilotChatAudioRecorder ref={recorder.recorderRef} />}
        <textarea
          aria-label="Case notes"
          className="border-border bg-background min-h-[60px] w-full resize-none rounded-lg border p-3 text-sm focus:ring-1 focus:ring-indigo-500 focus:outline-none"
          placeholder="Record or type your notes about the case…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        <RecordButton recorder={recorder} />
      </div>

      <Button type="button" className="w-full shrink-0" onClick={onReady}>
        Begin Examination
      </Button>
    </div>
  );
}

const MIN_VIGNETTE_PCT = 20;
const MAX_VIGNETTE_PCT = 65;

function QuestioningPane({
  caseBody,
  sources,
  transcript,
  onAnswer,
  isRunning,
  loadingStep = "",
}: {
  caseBody: string;
  sources: CaseSource[];
  transcript: OralBoardsExchange[];
  onAnswer: (text: string) => void;
  isRunning: boolean;
  loadingStep?: string;
}) {
  const { currentQuestion: question } = useOralBoardsQuestion();
  const questionNumber = transcript.length + 1;

  const [answerText, setAnswerText] = useState("");
  const [leftPct, setLeftPct] = useState(42);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const recorder = useAnswerRecorder((text) => {
    setAnswerText((prev) => (prev ? `${prev} ${text}` : text));
  });

  const handleSubmit = () => {
    const trimmed = answerText.trim();
    if (!trimmed || isRunning) return;
    onAnswer(trimmed);
    setAnswerText("");
  };

  const handleDividerPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      dragging.current = true;
      const container = containerRef.current;
      if (!container) return;
      const startX = e.clientX;
      const startPct = leftPct;
      const totalWidth = container.getBoundingClientRect().width;

      const onMove = (ev: PointerEvent) => {
        if (!dragging.current) return;
        const delta = ((ev.clientX - startX) / totalWidth) * 100;
        setLeftPct(Math.min(MAX_VIGNETTE_PCT, Math.max(MIN_VIGNETTE_PCT, startPct + delta)));
      };
      const onUp = () => {
        dragging.current = false;
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
      };
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
    },
    [leftPct],
  );

  const olderExchanges = transcript.slice(0, -1);
  const lastExchange = transcript.at(-1);

  return (
    <div ref={containerRef} className="flex h-full overflow-hidden">
      {/* Left: case vignette — pinned, always in view */}
      <VignettePanel caseBody={caseBody} sources={sources} width={leftPct} />

      {/* Drag handle */}
      <div
        role="separator"
        aria-label="Resize panels"
        aria-orientation="vertical"
        className="group relative z-10 flex w-1.5 shrink-0 cursor-col-resize items-center justify-center border-r bg-transparent transition-colors hover:bg-indigo-500/20 active:bg-indigo-500/30"
        onPointerDown={handleDividerPointerDown}
      >
        <div className="bg-border h-8 w-0.5 rounded-full transition-colors group-hover:bg-indigo-400" />
      </div>

      {/* Right: examination Q&A */}
      <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-hidden p-4">
        {/* Scrollable history: completed + last feedback */}
        {(olderExchanges.length > 0 || lastExchange) && (
          <div className="max-h-[40%] shrink-0 space-y-1.5 overflow-y-auto pr-0.5">
            {olderExchanges.map((x, i) => (
              <CompletedExchangeRow key={x.question || i} exchange={x} index={i} />
            ))}
            {lastExchange && (
              <LastFeedbackCard exchange={lastExchange} index={transcript.length - 1} />
            )}
          </div>
        )}

        {/* Active question — fills remaining height */}
        <div className="relative flex min-h-0 flex-1 flex-col gap-3 overflow-hidden rounded-xl border-l-4 border-indigo-500 bg-indigo-950/15 p-4 pl-5">
          {/* Ghost question number */}
          <span
            aria-hidden
            className="pointer-events-none absolute -top-2 right-3 font-mono text-[72px] leading-none font-black text-indigo-500/[0.07] select-none"
          >
            {questionNumber}
          </span>

          <div className="flex shrink-0 items-center justify-between">
            <p className="text-[10px] font-semibold tracking-[0.15em] text-indigo-400 uppercase">
              Question {questionNumber}
            </p>
            {question && <TtsButton text={question} label="Listen" />}
          </div>

          <p className="relative z-10 shrink-0 text-[13.5px] leading-relaxed">
            {question ? (
              question
            ) : (
              <span className="text-muted-foreground flex items-center gap-2">
                {isRunning && <Loader2Icon className="size-3 animate-spin" />}
                {isRunning
                  ? loadingStep || "Preparing next question…"
                  : "Waiting for the next question…"}
              </span>
            )}
          </p>

          {recorder.micSupported && <CopilotChatAudioRecorder ref={recorder.recorderRef} />}

          <textarea
            aria-label="Your answer"
            className="border-border bg-background min-h-[80px] flex-1 resize-none rounded-lg border p-3 text-sm focus:ring-1 focus:ring-indigo-500 focus:outline-none disabled:opacity-50"
            placeholder="Type your answer… (⌘↵ to submit)"
            value={answerText}
            onChange={(e) => setAnswerText(e.target.value)}
            disabled={isRunning || recorder.recording}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSubmit();
            }}
          />

          <div className="flex shrink-0 items-center justify-end gap-2">
            <RecordButton recorder={recorder} />
            <Button
              type="button"
              size="sm"
              disabled={isRunning || !answerText.trim()}
              onClick={handleSubmit}
            >
              Submit
            </Button>
          </div>
        </div>
      </div>
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
      {scoreCard.trim() && <Streamdown key={scoreCard}>{scoreCard}</Streamdown>}
      {transcript.length > 0 && (
        <div className="space-y-3">
          {transcript.map((x, i) => (
            <div key={x.question || i} className="border-border space-y-1.5 border-t pt-3 text-sm">
              <p className="text-muted-foreground text-[10px] font-semibold tracking-[0.15em] uppercase">
                Q{i + 1}
              </p>
              <p className="font-medium">{x.question}</p>
              {x.answer && <p className="text-muted-foreground text-xs">Your answer: {x.answer}</p>}
              {x.feedback && <Streamdown>{x.feedback}</Streamdown>}
              <CitationChips sources={x.citations ?? []} />
            </div>
          ))}
        </div>
      )}
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
  onAnswer,
  isRunning,
  loadingStep = "",
}: {
  state: OralBoardsState;
  fullscreen: boolean;
  onClose: () => void;
  onToggleFullscreen: () => void;
  onReady: () => void;
  onAnswer: (text: string) => void;
  isRunning: boolean;
  loadingStep?: string;
}) {
  const status = state.status ?? "idle";
  const caseBody = state.case ?? "";
  const sources = state.case_sources ?? [];
  const transcript = state.transcript ?? [];
  const scoreCard = state.score_card ?? "";

  const isQuestioning = status === "questioning";

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
      <ArtifactContent
        className={
          isQuestioning
            ? "flex h-full overflow-hidden p-0"
            : status === "presenting"
              ? "flex h-full flex-col"
              : "space-y-4"
        }
      >
        {status === "presenting" && (
          <PresentingPane caseBody={caseBody} sources={sources} onReady={onReady} />
        )}
        {isQuestioning && (
          <QuestioningPane
            caseBody={caseBody}
            sources={sources}
            transcript={transcript}
            onAnswer={onAnswer}
            isRunning={isRunning}
            loadingStep={loadingStep}
          />
        )}
        {(status === "complete" || status === "feedback" || Boolean(scoreCard.trim())) && (
          <FeedbackPane scoreCard={scoreCard} transcript={transcript} />
        )}
      </ArtifactContent>
    </Artifact>
  );
}
