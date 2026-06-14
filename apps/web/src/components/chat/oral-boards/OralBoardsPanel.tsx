"use client";

import { useState } from "react";
import { Streamdown } from "streamdown";
import {
  AlertCircleIcon,
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
      {sources.map((s, i) => (
        <span
          key={`${s.collection}-${s.docid}-${i}`}
          className="bg-muted text-muted-foreground rounded-md px-1.5 py-0.5 text-[11px]"
        >
          {s.collection} #{s.docid} · {s.title}
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
          <button type="button" onClick={clearError} className="ml-1 underline">Dismiss</button>
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

function QuestionTtsButton({ text }: { text: string }) {
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
    <Button type="button" variant="ghost" size="icon" className="size-6" onClick={toggle}>
      {playing ? <SquareIcon className="size-3" /> : <PlayIcon className="size-3" />}
    </Button>
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
  const [notes, setNotes] = useState("");
  const recorder = useAnswerRecorder(
    (text) => setNotes((prev) => (prev ? `${prev} ${text}` : text)),
  );

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex-1 overflow-auto">
        <VignetteBody caseBody={caseBody} sources={sources} />
      </div>

      <div className="shrink-0 space-y-2">
        <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">Your notes</p>
        {recorder.micSupported && <CopilotChatAudioRecorder ref={recorder.recorderRef} />}
        <textarea
          aria-label="Case notes"
          className="border-border bg-background min-h-[60px] w-full resize-none rounded border p-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
          placeholder="Record or type your notes about the case…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        <RecordButton recorder={recorder} />
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
  onAnswer,
  isRunning,
}: {
  caseBody: string;
  sources: CaseSource[];
  transcript: OralBoardsExchange[];
  onAnswer: (text: string) => void;
  isRunning: boolean;
}) {
  const { currentQuestion: question } = useOralBoardsQuestion();
  const questionNumber = transcript.length + 1;

  const [answerText, setAnswerText] = useState("");
  const [expandedChip, setExpandedChip] = useState<number | null>(null);

  const recorder = useAnswerRecorder(
    (text) => {
      setAnswerText((prev) => (prev ? `${prev} ${text}` : text));
    },
  );

  const handleSubmit = () => {
    const trimmed = answerText.trim();
    if (!trimmed || isRunning) return;
    onAnswer(trimmed);
    setAnswerText("");
  };

  const olderExchanges = transcript.slice(0, -1);
  const lastExchange = transcript.at(-1);

  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden">
      {olderExchanges.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {olderExchanges.map((x, i) => (
            <div key={x.question || i}>
              <button
                type="button"
                onClick={() => setExpandedChip(expandedChip === i ? null : i)}
                className="bg-muted text-muted-foreground hover:text-foreground rounded-full border px-2.5 py-0.5 text-xs transition-colors"
              >
                Q{i + 1} · {truncate(x.question, 22)} ✓
              </button>
              {expandedChip === i && (
                <div className="bg-muted mt-1.5 space-y-1 rounded-lg p-3 text-sm">
                  <p className="font-medium">{x.question}</p>
                  {x.answer && (
                    <p className="text-muted-foreground">Your answer: {x.answer}</p>
                  )}
                  {x.feedback && <Streamdown>{x.feedback}</Streamdown>}
                  <CitationChips sources={x.citations ?? []} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {lastExchange && (
        <div className="bg-muted shrink-0 space-y-1 rounded-lg p-3 text-sm">
          <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
            Q{transcript.length} · Feedback
          </p>
          <p className="font-medium">{lastExchange.question}</p>
          {lastExchange.answer && (
            <p className="text-muted-foreground">Your answer: {lastExchange.answer}</p>
          )}
          {lastExchange.feedback && <Streamdown>{lastExchange.feedback}</Streamdown>}
          <CitationChips sources={lastExchange.citations ?? []} />
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-3 rounded-lg border-2 border-indigo-500 bg-indigo-950/20 p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="text-indigo-400 text-xs font-semibold uppercase tracking-wide">
            Q{questionNumber}
          </p>
          {question && (
            <QuestionTtsButton text={question} />
          )}
        </div>
        <p className="text-sm leading-relaxed">
          {question || "Waiting for the next question…"}
        </p>
        {recorder.micSupported && <CopilotChatAudioRecorder ref={recorder.recorderRef} />}
        <textarea
          aria-label="Your answer"
          className="border-border bg-background min-h-[80px] flex-1 resize-none rounded border p-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
          placeholder="Type your answer…"
          value={answerText}
          onChange={(e) => setAnswerText(e.target.value)}
          disabled={isRunning || recorder.recording}
        />
        <div className="flex items-center justify-end gap-2">
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

      <details className="shrink-0">
        <summary className="text-muted-foreground cursor-pointer text-xs font-medium uppercase tracking-wide select-none">
          Case vignette
        </summary>
        <div className="mt-2">
          <VignetteBody caseBody={caseBody} sources={sources} showTts={false} />
        </div>
      </details>
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
  onAnswer,
  isRunning,
}: {
  state: OralBoardsState;
  fullscreen: boolean;
  onClose: () => void;
  onToggleFullscreen: () => void;
  onReady: () => void;
  onAnswer: (text: string) => void;
  isRunning: boolean;
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
      <ArtifactContent className={status === "presenting" ? "flex h-full flex-col" : status === "questioning" ? "flex h-full flex-col" : "space-y-4"}>
        {status === "presenting" && (
          <PresentingPane caseBody={caseBody} sources={sources} onReady={onReady} />
        )}
        {status === "questioning" && (
          <QuestioningPane
            caseBody={caseBody}
            sources={sources}
            transcript={transcript}
            onAnswer={onAnswer}
            isRunning={isRunning}
          />
        )}
        {(status === "complete" || status === "feedback") && (
          <FeedbackPane scoreCard={scoreCard} transcript={transcript} />
        )}
      </ArtifactContent>
    </Artifact>
  );
}