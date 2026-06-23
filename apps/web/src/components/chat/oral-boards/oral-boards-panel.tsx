"use client";

import { useState } from "react";
import { Streamdown } from "@agents/ui";
import {
  AlertCircleIcon,
  BookOpenIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  Loader2Icon,
  MicIcon,
  PencilIcon,
  PlayIcon,
  SendHorizontalIcon,
  SquareIcon,
  StethoscopeIcon,
} from "lucide-react";
import { CopilotChatAudioRecorder } from "@copilotkit/react-core/v2";

import { OCE_SKILL_LEVELS } from "@agents/types";
import type {
  CaseSource,
  OralBoardsExchange,
  OralBoardsOutcome,
  OralBoardsSkillsetScore,
  OralBoardsState,
} from "@agents/types";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Kbd,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  ScrollArea,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
} from "@agents/ui";
import {
  Artifact,
  ArtifactContent,
  ArtifactHeader,
  ArtifactTitle,
} from "@agents/ui/components/ai-elements/artifact";
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
    <div className="flex min-w-0 flex-wrap gap-1">
      {sources.map((s) => (
        <Badge
          key={`${s.collection}-${s.docid}`}
          variant="secondary"
          className="max-w-full min-w-0 truncate font-mono text-[10px]"
        >
          {s.collection.toUpperCase()} #{s.docid} · {s.title}
        </Badge>
      ))}
    </div>
  );
}

function scoreClasses(score: number): string {
  if (score >= 3) return "border-emerald-700/40 bg-emerald-950/30 text-emerald-300";
  if (score === 2) return "border-amber-700/40 bg-amber-950/30 text-amber-300";
  return "border-red-700/40 bg-red-950/30 text-red-300";
}

// Blueprint skillset (domain), cognitive skill level, and 1-3 practice score
// for one exchange. Hidden gracefully when the agent hasn't tagged the answer.
function SkillsetBadges({ exchange }: { exchange: OralBoardsExchange }) {
  const skillMeta = exchange.skill ? OCE_SKILL_LEVELS[exchange.skill] : undefined;
  if (!exchange.skillset && !skillMeta && exchange.score == null) return null;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {exchange.skillset && (
        <Badge variant="secondary" className="text-[10px]">
          {exchange.skillset}
        </Badge>
      )}
      {skillMeta && (
        <Badge variant="secondary" title={skillMeta.description} className="text-[10px]">
          {skillMeta.label}
        </Badge>
      )}
      {exchange.score != null && (
        <Badge
          className={`rounded border text-[10px] font-semibold ${scoreClasses(exchange.score)}`}
        >
          {exchange.score}/3
        </Badge>
      )}
    </div>
  );
}

// The model answer the candidate should have given — produced by the agent but
// previously never surfaced in the UI.
function ModelAnswer({ text }: { text: string }) {
  if (!text.trim()) return null;
  return (
    <div className="border-border/60 rounded border border-dashed px-2.5 py-2 text-xs">
      <p className="text-muted-foreground mb-1 text-[10px] font-semibold tracking-wide uppercase">
        Model answer
      </p>
      <Streamdown>{text}</Streamdown>
    </div>
  );
}

const OUTCOME_META: Record<OralBoardsOutcome, { label: string; cls: string }> = {
  pass: {
    label: "On track to pass",
    cls: "border-emerald-700/40 bg-emerald-950/30 text-emerald-300",
  },
  borderline: {
    label: "Borderline",
    cls: "border-amber-700/40 bg-amber-950/30 text-amber-300",
  },
  not_yet: {
    label: "Not yet passing",
    cls: "border-red-700/40 bg-red-950/30 text-red-300",
  },
};

function OutcomeBanner({ outcome }: { outcome: OralBoardsOutcome }) {
  const meta = OUTCOME_META[outcome];
  return (
    <Alert className={meta.cls}>
      <AlertTitle className="font-semibold">Practice outcome: {meta.label}</AlertTitle>
      <AlertDescription className="text-[11px] opacity-80">
        Study estimate only — the real OCE is reported Pass/Fail and each skillset is scored
        independently by two examiners.
      </AlertDescription>
    </Alert>
  );
}

function ScoreSummaryTable({ summary }: { summary: OralBoardsSkillsetScore[] }) {
  if (summary.length === 0) return null;
  return (
    <div className="overflow-hidden rounded-lg border">
      <Table className="text-xs">
        <TableHeader className="bg-muted/40 text-muted-foreground">
          <TableRow>
            <TableHead className="px-2.5">Skillset</TableHead>
            <TableHead className="px-2.5">Skill</TableHead>
            <TableHead className="px-2.5 text-center">Score</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {summary.map((row) => (
            <TableRow key={`${row.skillset}-${row.skill ?? "na"}`} className="align-top">
              <TableCell className="px-2.5 py-1.5">
                <p className="font-medium">{row.skillset}</p>
                {row.rationale && <p className="text-muted-foreground mt-0.5">{row.rationale}</p>}
              </TableCell>
              <TableCell className="text-muted-foreground px-2.5 py-1.5 whitespace-nowrap">
                {row.skill ? OCE_SKILL_LEVELS[row.skill].label : "—"}
              </TableCell>
              <TableCell className="px-2.5 py-1.5 text-center">
                <Badge className={`rounded border font-semibold ${scoreClasses(row.score)}`}>
                  {row.score}/3
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
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
          <Button
            type="button"
            variant="link"
            size="xs"
            onClick={clearError}
            className="ml-1 h-auto p-0 underline"
          >
            Dismiss
          </Button>
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

// Permanent left column during questioning — the vignette is always in view,
// with the candidate's running notes editable beneath it.
function VignettePanel({
  caseBody,
  sources,
  notes,
  onNotesChange,
}: {
  caseBody: string;
  sources: CaseSource[];
  notes: string;
  onNotesChange: React.Dispatch<React.SetStateAction<string>>;
}) {
  return (
    <ScrollArea className="bg-muted/25 h-full shrink-0 border-b md:border-r md:border-b-0">
      <div className="flex flex-col gap-4 p-4 sm:px-5">
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

        <div className="mt-auto space-y-3">
          <div className="border-t pt-3">
            <p className="text-muted-foreground mb-1.5 flex items-center gap-1.5 text-[10px] font-medium tracking-wide uppercase">
              <PencilIcon className="size-3" />
              Your notes
            </p>
            <Textarea
              aria-label="Case notes"
              className="min-h-[56px] resize-none p-2.5 text-xs leading-relaxed"
              placeholder="Jot notes as you reason through the case…"
              value={notes}
              onChange={(e) => onNotesChange(e.target.value)}
            />
          </div>
          {sources.length > 0 && (
            <div className="border-t pt-3">
              <p className="text-muted-foreground mb-1.5 text-[10px] font-medium tracking-wide uppercase">
                Sources
              </p>
              <CitationChips sources={sources} />
            </div>
          )}
        </div>
      </div>
    </ScrollArea>
  );
}

function CompletedExchangeRow({
  exchange,
  index,
}: {
  exchange: OralBoardsExchange;
  index: number;
}) {
  return (
    <Collapsible className="overflow-hidden rounded-lg border">
      <CollapsibleTrigger className="hover:bg-muted flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors">
        <CheckCircle2Icon className="size-3 shrink-0 text-emerald-400" />
        <span className="font-medium text-emerald-300/90">Q{index + 1}</span>
        <span className="text-muted-foreground flex-1 truncate">
          {truncate(exchange.question, 52)}
        </span>
        <ChevronDownIcon className="text-muted-foreground size-3 transition-transform data-[open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-1.5 border-t px-3 py-2.5 text-xs">
        <SkillsetBadges exchange={exchange} />
        <p className="text-sm font-medium">{exchange.question}</p>
        {exchange.answer && (
          <p className="text-muted-foreground">
            <span className="text-foreground/60 font-medium">Your answer: </span>
            {exchange.answer}
          </p>
        )}
        {exchange.feedback && <Streamdown>{exchange.feedback}</Streamdown>}
        <ModelAnswer text={exchange.ideal_response} />
        <CitationChips sources={exchange.citations ?? []} />
      </CollapsibleContent>
    </Collapsible>
  );
}

function LastFeedbackCard({ exchange, index }: { exchange: OralBoardsExchange; index: number }) {
  return (
    <div className="shrink-0 space-y-1.5 rounded-lg border p-3 text-sm">
      <p className="text-[10px] font-semibold tracking-[0.15em] text-emerald-400 uppercase">
        Q{index + 1} · Feedback
      </p>
      <SkillsetBadges exchange={exchange} />
      <p className="font-medium">{exchange.question}</p>
      {exchange.answer && (
        <p className="text-muted-foreground text-xs">Your answer: {exchange.answer}</p>
      )}
      {exchange.feedback && <Streamdown>{exchange.feedback}</Streamdown>}
      <ModelAnswer text={exchange.ideal_response} />
      <CitationChips sources={exchange.citations ?? []} />
    </div>
  );
}

function PresentingPane({
  caseBody,
  sources,
  onReady,
  notes,
  onNotesChange,
}: {
  caseBody: string;
  sources: CaseSource[];
  onReady: () => void;
  notes: string;
  onNotesChange: React.Dispatch<React.SetStateAction<string>>;
}) {
  const recorder = useAnswerRecorder((text) =>
    onNotesChange((prev) => (prev ? `${prev} ${text}` : text)),
  );

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex shrink-0 items-center justify-between">
        <p className="text-muted-foreground text-xs">
          Read and analyze the case. Take notes before beginning.
        </p>
        <TtsButton text={caseBody} label="Present case" />
      </div>

      <ScrollArea className="bg-muted/20 flex-1 rounded-lg border">
        <div className="p-4 sm:p-5">
          <div className="text-[13.5px] leading-[1.75]">
            <Streamdown>{caseBody}</Streamdown>
          </div>
          {sources.length > 0 && (
            <div className="mt-4 border-t pt-3">
              <CitationChips sources={sources} />
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="shrink-0 space-y-2">
        <p className="text-muted-foreground text-[10px] font-semibold tracking-[0.15em] uppercase">
          Your Notes
        </p>
        {recorder.micSupported && <CopilotChatAudioRecorder ref={recorder.recorderRef} />}
        <Textarea
          aria-label="Case notes"
          className="min-h-[60px] resize-none p-3 text-sm"
          placeholder="Record or type your notes about the case…"
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
        />
        <RecordButton recorder={recorder} />
      </div>

      <Button type="button" className="w-full shrink-0" onClick={onReady}>
        Begin Examination
      </Button>
    </div>
  );
}

// Sequential progress dots — answered skillsets vs. the live question.
function QuestionProgress({ answered, current }: { answered: number; current: number }) {
  const total = Math.max(answered + 1, current);
  return (
    <div className="flex items-center gap-1" aria-hidden>
      {Array.from({ length: total }).map((_, i) => {
        const dot =
          i === current - 1
            ? "size-1.5 rounded-full ring-2 ring-indigo-400/25"
            : i < answered
              ? "size-1.5 rounded-full bg-emerald-500/70"
              : "size-1.5 rounded-full bg-muted-foreground/25";
        // oxlint-disable-next-line react/no-array-index-key -- positional dots, no identity
        return <span key={i} className={dot} />;
      })}
    </div>
  );
}

// "Examiner is thinking" placeholder shown until the next question streams in.
function ThinkingState({ isRunning, loadingStep }: { isRunning: boolean; loadingStep: string }) {
  return (
    <div className="text-muted-foreground flex items-center gap-2.5">
      <span className="flex gap-1">
        <span className="size-1.5 animate-pulse rounded-full bg-current [animation-delay:-0.3s]" />
        <span className="size-1.5 animate-pulse rounded-full bg-current [animation-delay:-0.15s]" />
        <span className="size-1.5 animate-pulse rounded-full bg-current" />
      </span>
      <span className="text-[13px] italic">
        {isRunning ? loadingStep || "The examiner is thinking…" : "Waiting for the next question…"}
      </span>
    </div>
  );
}

// Live streaming feedback preview shown while the evaluator is generating —
// disappears once append_exchange commits the exchange to transcript.
function LiveFeedbackPreview({
  activeFeedback,
  activeIdealResponse,
}: {
  activeFeedback: string;
  activeIdealResponse: string;
}) {
  if (!activeFeedback.trim()) return null;
  return (
    <div className="shrink-0 space-y-1.5 rounded-lg border border-dashed p-3 text-sm">
      <p className="text-[10px] font-semibold tracking-[0.15em] text-amber-400 uppercase">
        Feedback · generating…
      </p>
      <Streamdown>{activeFeedback}</Streamdown>
      {activeIdealResponse.trim() && <ModelAnswer text={activeIdealResponse} />}
    </div>
  );
}

function QuestioningPane({
  caseBody,
  sources,
  transcript,
  onAnswer,
  isRunning,
  loadingStep = "",
  notes,
  onNotesChange,
  activeFeedback = "",
  activeIdealResponse = "",
}: {
  caseBody: string;
  sources: CaseSource[];
  transcript: OralBoardsExchange[];
  onAnswer: (text: string) => void;
  isRunning: boolean;
  loadingStep?: string;
  notes: string;
  onNotesChange: React.Dispatch<React.SetStateAction<string>>;
  activeFeedback?: string;
  activeIdealResponse?: string;
}) {
  const { currentQuestion: question } = useOralBoardsQuestion();
  const questionNumber = transcript.length + 1;

  const [answerText, setAnswerText] = useState("");

  const recorder = useAnswerRecorder((text) => {
    setAnswerText((prev) => (prev ? `${prev} ${text}` : text));
  });

  const handleSubmit = () => {
    const trimmed = answerText.trim();
    if (!trimmed || isRunning) return;
    onAnswer(trimmed);
    setAnswerText("");
  };

  const olderExchanges = transcript.slice(0, -1);
  const lastExchange = transcript.at(-1);

  return (
    <ResizablePanelGroup orientation="horizontal" className="h-full">
      {/* Left: case vignette — pinned, always in view */}
      <ResizablePanel defaultSize="50%">
        <VignettePanel
          caseBody={caseBody}
          sources={sources}
          notes={notes}
          onNotesChange={onNotesChange}
        />
      </ResizablePanel>

      <ResizableHandle withHandle />

      {/* Right: examination Q&A */}
      <ResizablePanel>
        <div className="flex h-full flex-col">
          {/* Progress header — fixed outside ResizablePanelGroup */}
          <div className="shrink-0 border-b px-4 py-2">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-[10px] font-semibold tracking-[0.15em] uppercase">
                Examination
              </span>
              <QuestionProgress answered={transcript.length} current={questionNumber} />
            </div>
            {transcript.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {[...new Set(transcript.map((x) => x.skillset).filter(Boolean))].map((skillset) => {
                  const scores = transcript
                    .filter((x) => x.skillset === skillset)
                    .map((x) => x.score)
                    .filter((s) => s != null);
                  const avg = scores.length
                    ? scores.reduce((a, b) => a + b, 0) / scores.length
                    : null;
                  return (
                    <Badge
                      key={skillset}
                      variant="secondary"
                      className={`py-0 text-[9px] ${avg != null ? scoreClasses(Math.round(avg)) : ""}`}
                    >
                      {skillset}
                      {avg != null && <span className="ml-1 opacity-70">{avg.toFixed(1)}</span>}
                    </Badge>
                  );
                })}
              </div>
            )}
          </div>

          <ResizablePanelGroup orientation="vertical" className="min-h-0 flex-1">
            <ResizablePanel>
              <ScrollArea className="h-full border-b">
                {[olderExchanges.length > 0, lastExchange, activeFeedback].some(Boolean) && (
                  <div className="space-y-1.5 px-4 py-3">
                    {olderExchanges.map((x, i) => (
                      <CompletedExchangeRow key={x.question || i} exchange={x} index={i} />
                    ))}
                    {lastExchange && (
                      <LastFeedbackCard exchange={lastExchange} index={transcript.length - 1} />
                    )}
                    {isRunning && (
                      <LiveFeedbackPreview
                        activeFeedback={activeFeedback}
                        activeIdealResponse={activeIdealResponse}
                      />
                    )}
                  </div>
                )}
              </ScrollArea>
            </ResizablePanel>
            <ResizableHandle withHandle />

            {/* Active question + response composer */}
            <ResizablePanel>
              <ScrollArea className="h-full">
                <div className="flex flex-col gap-3 p-4">
                  {/* Examiner prompt */}
                  <Card>
                    <CardHeader className="flex-row items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <Avatar className="size-8 ring-1 ring-indigo-500/30">
                          <AvatarFallback className="bg-indigo-500/15 text-indigo-300">
                            <StethoscopeIcon className="size-4" />
                          </AvatarFallback>
                        </Avatar>
                        <div className="leading-tight">
                          <p className="text-[10px] font-semibold tracking-[0.12em] text-indigo-300/80 uppercase">
                            Examiner
                          </p>
                          <p className="text-muted-foreground text-[11px]">
                            Question {questionNumber}
                          </p>
                        </div>
                      </div>
                      {question && <TtsButton text={question} label="Listen" />}
                    </CardHeader>
                    <CardContent>
                      {question ? (
                        <p className="text-[15px] leading-relaxed font-medium text-pretty">
                          {question}
                        </p>
                      ) : (
                        <ThinkingState isRunning={isRunning} loadingStep={loadingStep} />
                      )}
                    </CardContent>
                  </Card>

                  {/* Response composer */}
                  <div className="bg-muted/15 flex shrink-0 flex-col gap-2 rounded-xl border p-3 md:min-h-0 md:flex-1">
                    <div className="flex shrink-0 items-center justify-between">
                      <p className="text-muted-foreground text-[10px] font-semibold tracking-[0.15em] uppercase">
                        Your response
                      </p>
                      <RecordButton recorder={recorder} />
                    </div>

                    {recorder.micSupported && (
                      <CopilotChatAudioRecorder ref={recorder.recorderRef} />
                    )}

                    <Textarea
                      aria-label="Your answer"
                      className="h-24 resize-none p-3 text-sm md:h-auto md:min-h-[80px] md:flex-1"
                      placeholder="Type your answer…"
                      value={answerText}
                      onChange={(e) => setAnswerText(e.target.value)}
                      disabled={isRunning || recorder.recording}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSubmit();
                      }}
                    />

                    <div className="flex shrink-0 items-center justify-between">
                      <span className="text-muted-foreground hidden items-center gap-1 text-[11px] md:flex">
                        <Kbd>⌘</Kbd>
                        <Kbd>↵</Kbd>
                        <span className="ml-0.5">to submit</span>
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        disabled={isRunning || !answerText.trim()}
                        onClick={handleSubmit}
                        className="ml-auto"
                      >
                        <SendHorizontalIcon className="size-3.5" />
                        Submit
                      </Button>
                    </div>
                  </div>
                </div>
              </ScrollArea>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

function FeedbackPane({
  scoreCard,
  scoreSummary,
  outcome,
  transcript,
  onNewCase,
}: {
  scoreCard: string;
  scoreSummary: OralBoardsSkillsetScore[];
  outcome?: OralBoardsOutcome;
  transcript: OralBoardsExchange[];
  onNewCase: () => void;
}) {
  const isEmpty = !scoreCard.trim() && scoreSummary.length === 0 && transcript.length === 0;
  return (
    <div className="space-y-4">
      {outcome && <OutcomeBanner outcome={outcome} />}
      {scoreSummary.length > 0 && (
        <p className="text-muted-foreground text-xs">
          {scoreSummary.length} skillset{scoreSummary.length === 1 ? "" : "s"} assessed · scored
          independently on the ABPD 1–3 scale
        </p>
      )}
      <ScoreSummaryTable summary={scoreSummary} />
      {scoreCard.trim() && <Streamdown key={scoreCard}>{scoreCard}</Streamdown>}
      {transcript.length > 0 && (
        <div className="space-y-3">
          {transcript.map((x, i) => (
            <div key={x.question || i} className="border-border space-y-1.5 border-t pt-3 text-sm">
              <p className="text-muted-foreground text-[10px] font-semibold tracking-[0.15em] uppercase">
                Q{i + 1}
              </p>
              <SkillsetBadges exchange={x} />
              <p className="font-medium">{x.question}</p>
              {x.answer && <p className="text-muted-foreground text-xs">Your answer: {x.answer}</p>}
              {x.feedback && <Streamdown>{x.feedback}</Streamdown>}
              <ModelAnswer text={x.ideal_response} />
              <CitationChips sources={x.citations ?? []} />
            </div>
          ))}
        </div>
      )}
      {isEmpty ? (
        <p className="text-muted-foreground text-sm">No feedback yet.</p>
      ) : (
        <div className="border-t pt-4">
          <Button type="button" className="w-full" onClick={onNewCase}>
            <PlayIcon className="size-3.5" />
            Start a new case
          </Button>
        </div>
      )}
    </div>
  );
}

export function OralBoardsPanel({
  state,
  onClose,
  onReady,
  onAnswer,
  isRunning,
  loadingStep = "",
  activeFeedback = "",
  activeIdealResponse = "",
}: {
  state: OralBoardsState;
  onClose: () => void;
  onReady: () => void;
  onAnswer: (text: string) => void;
  isRunning: boolean;
  loadingStep?: string;
  activeFeedback?: string;
  activeIdealResponse?: string;
}) {
  const status = state.status ?? "idle";
  const caseBody = state.case ?? "";
  const sources = state.case_sources ?? [];
  const transcript = state.transcript ?? [];
  const scoreCard = state.score_card ?? "";
  const scoreSummary = state.score_summary ?? [];
  const outcome = state.outcome;

  // Scratch notes persist across presenting → questioning so the candidate
  // keeps what they jotted while reading the case.
  const [notes, setNotes] = useState("");

  const isQuestioning = status === "questioning";

  return (
    <Artifact className="min-h-0 flex-1 rounded-none border-0">
      <ArtifactHeader>
        <ArtifactTitle>Oral board</ArtifactTitle>
      </ArtifactHeader>
      <ArtifactContent
        className={
          isQuestioning
            ? "flex overflow-hidden p-0"
            : status === "presenting"
              ? "flex flex-col"
              : "space-y-4"
        }
      >
        {status === "presenting" && (
          <PresentingPane
            caseBody={caseBody}
            sources={sources}
            onReady={onReady}
            notes={notes}
            onNotesChange={setNotes}
          />
        )}
        {isQuestioning && (
          <QuestioningPane
            caseBody={caseBody}
            sources={sources}
            transcript={transcript}
            onAnswer={onAnswer}
            isRunning={isRunning}
            loadingStep={loadingStep}
            notes={notes}
            onNotesChange={setNotes}
            activeFeedback={activeFeedback}
            activeIdealResponse={activeIdealResponse}
          />
        )}
        {(status === "complete" || status === "feedback" || Boolean(scoreCard.trim())) && (
          <FeedbackPane
            scoreCard={scoreCard}
            scoreSummary={scoreSummary}
            outcome={outcome}
            transcript={transcript}
            onNewCase={onClose}
          />
        )}
      </ArtifactContent>
    </Artifact>
  );
}
