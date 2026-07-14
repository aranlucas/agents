"use client";

import { useEffect, useRef, useState } from "react";
import { Streamdown } from "@agents/ui";
import {
  AlertCircleIcon,
  BookOpenIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  GraduationCapIcon,
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
  OralBoardsSkill,
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
} from "@agents/ui";
import { useIsMobile } from "@agents/ui/hooks/use-mobile";
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

// --- LLM-written state guards ---------------------------------------------
// OralBoardsState is written by an LLM tool call at runtime, so every typed
// field can arrive missing, null, or the wrong shape even though the
// declared type says otherwise. These helpers coerce defensively instead of
// trusting the type at the point of use.

function asText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

// A non-empty string, or undefined — for `{x && <Badge>{x}</Badge>}`-style
// conditional rendering where a non-string value would crash React as a
// child (e.g. an object) instead of just rendering oddly.
function safeString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function asArray<T>(value: unknown): T[] {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Array.isArray narrows to any[]
  return Array.isArray(value) ? (value as T[]) : [];
}

// `score` fields are typed `1 | 2 | 3` but an LLM can write a string, null,
// or anything else. `null`/`undefined` must stay "no score" rather than
// coerce to 0 (Number(null) === 0).
function scoreNumber(value: unknown): number | undefined {
  if (value == null) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

// Agent state is LLM-written at runtime, so enum-typed fields can carry
// off-enum strings — look up display metadata defensively instead of trusting
// the declared type.
function skillMetaFor(
  skill: OralBoardsSkill | undefined,
): { label: string; description: string } | undefined {
  return skill ? OCE_SKILL_LEVELS[skill] : undefined;
}

function stripMarkdownForSpeech(text: string): string {
  // Defense in depth: TtsButton's `text` prop is typed string, but every
  // call site ultimately traces back to LLM-written state.
  return asText(text)
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
  const sourceKeyCounts = new Map<string, number>();

  return (
    <div className="flex min-w-0 flex-wrap gap-1">
      {sources.map((s) => {
        const collection = safeString(s.collection) ?? "src";
        const docid = typeof s.docid === "number" || typeof s.docid === "string" ? s.docid : "?";
        const title = safeString(s.title) ?? "Untitled";
        const keySeed = `${collection}-${docid}-${title}`;
        const duplicate = sourceKeyCounts.get(keySeed) ?? 0;
        sourceKeyCounts.set(keySeed, duplicate + 1);
        const key = `${keySeed}-${duplicate + 1}`;
        return (
          <Badge
            key={key}
            variant="secondary"
            className="max-w-full min-w-0 truncate font-mono text-xs"
          >
            {collection.toUpperCase()} #{docid} · {title}
          </Badge>
        );
      })}
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
  const skillMeta = skillMetaFor(exchange.skill);
  const skillset = safeString(exchange.skillset);
  const score = scoreNumber(exchange.score);
  if (!skillset && !skillMeta && score == null) return null;
  return (
    <span className="flex flex-wrap items-center gap-1">
      {skillset && (
        <Badge variant="secondary" className="text-xs">
          {skillset}
        </Badge>
      )}
      {skillMeta && (
        <Badge variant="secondary" title={skillMeta.description} className="text-xs">
          {skillMeta.label}
        </Badge>
      )}
      {score != null && (
        <Badge className={`rounded border text-xs font-semibold ${scoreClasses(score)}`}>
          {score}/3
        </Badge>
      )}
    </span>
  );
}

// The model answer the candidate should have given — produced by the agent but
// previously never surfaced in the UI.
function ModelAnswer({ text }: { text: string }) {
  if (!text.trim()) return null;
  return (
    <div className="rounded border border-dashed border-border/60 px-2.5 py-2 text-xs">
      <p className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        Model answer
      </p>
      <Streamdown>{text}</Streamdown>
    </div>
  );
}

type FeedbackDetailsProps = {
  idealResponse: string | undefined;
  citations: CaseSource[];
};

function FeedbackDetails({ idealResponse, citations }: FeedbackDetailsProps) {
  const ideal = asText(idealResponse);
  if (!ideal.trim() && citations.length === 0) return null;

  return (
    <Collapsible className="rounded-lg border border-dashed">
      <CollapsibleTrigger className="group flex w-full items-center justify-between gap-2 px-2.5 py-2 text-left text-xs transition-colors hover:bg-muted">
        <span className="font-medium">Show model answer and sources</span>
        <ChevronDownIcon className="size-3 text-muted-foreground transition-transform group-data-panel-open:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-1.5 border-t px-2.5 py-2">
        <ModelAnswer text={ideal} />
        <CitationChips sources={citations} />
      </CollapsibleContent>
    </Collapsible>
  );
}

// Generic OCE answer-technique guidance — never case-specific, so it is safe
// to render as static content regardless of agent state. Collapsed by
// default so it doesn't compete with the live question for attention.
function AnswerCoach() {
  return (
    <Collapsible className="rounded-lg border border-dashed">
      <CollapsibleTrigger className="group flex w-full items-center justify-between gap-2 px-2.5 py-2 text-left text-xs transition-colors hover:bg-muted">
        <span className="flex items-center gap-1.5 font-medium">
          <GraduationCapIcon className="size-3.5 text-muted-foreground" />
          How to answer like a 3
        </span>
        <ChevronDownIcon className="size-3 text-muted-foreground transition-transform group-data-panel-open:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-1.5 border-t px-2.5 py-2 text-xs">
        <ul className="flex list-disc flex-col gap-1 ps-4 leading-relaxed text-muted-foreground">
          <li>
            <span className="font-medium text-foreground">Commit</span> — lead with your diagnosis
            or decision; don&apos;t list options without choosing.
          </li>
          <li>
            <span className="font-medium text-foreground">Anchor</span> — tie every point to THIS
            patient&apos;s findings, not textbook generalities.
          </li>
          <li>
            <span className="font-medium text-foreground">Justify</span> — give the
            &quot;because&quot;: guideline, risk, or mechanism.
          </li>
          <li>
            <span className="font-medium text-foreground">Close the loop</span> — say how a finding
            changes management: &quot;if present → X, if absent → Y&quot;.
          </li>
          <li>
            <span className="font-medium text-foreground">Don&apos;t parrot</span> — restating the
            question&apos;s terms isn&apos;t an answer; add the implication.
          </li>
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}

// Top-level shape guard for the whole exam state: collects every "?? []" /
// "?? \"\"" default in one place instead of scattering them, and — unlike a
// bare `?? []` — also covers the case where the LLM wrote a non-array/
// non-string value instead of omitting the field entirely.
function normalizeState(state: OralBoardsState): {
  status: NonNullable<OralBoardsState["status"]>;
  caseBody: string;
  sources: CaseSource[];
  transcript: OralBoardsExchange[];
  scoreCard: string;
  scoreSummary: OralBoardsSkillsetScore[];
  outcome: OralBoardsOutcome | undefined;
} {
  return {
    status: state.status ?? "idle",
    caseBody: asText(state.case),
    sources: asArray<CaseSource>(state.case_sources),
    transcript: asArray<OralBoardsExchange>(state.transcript),
    scoreCard: asText(state.score_card),
    scoreSummary: asArray<OralBoardsSkillsetScore>(state.score_summary),
    outcome: state.outcome,
  };
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
  // LLM-written state: an off-enum outcome hides the banner instead of crashing.
  const meta: { label: string; cls: string } | undefined = OUTCOME_META[outcome];
  if (!meta) return null;
  return (
    <Alert className={meta.cls}>
      <AlertTitle className="font-semibold">Practice outcome: {meta.label}</AlertTitle>
      <AlertDescription className="text-xs opacity-80">
        Study estimate only — the real OCE is reported Pass/Fail and each skillset is scored
        independently by two examiners.
      </AlertDescription>
    </Alert>
  );
}

function ScoreSummaryTable({ summary }: { summary: OralBoardsSkillsetScore[] }) {
  if (summary.length === 0) return null;
  const scoreRowKeyCounts = new Map<string, number>();

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
          {summary.map((row) => {
            const skillset = safeString(row.skillset) ?? "Unknown skillset";
            const rationale = safeString(row.rationale);
            const score = scoreNumber(row.score);
            const keySeed = `${skillset}-${row.skill ?? "na"}-${score ?? "na"}-${rationale}`;
            const duplicate = scoreRowKeyCounts.get(keySeed) ?? 0;
            scoreRowKeyCounts.set(keySeed, duplicate + 1);
            const key = `${keySeed}-${duplicate + 1}`;
            return (
              <TableRow key={key} className="align-top">
                <TableCell className="px-2.5 py-1.5">
                  <p className="font-medium">{skillset}</p>
                  {rationale && <p className="mt-0.5 text-muted-foreground">{rationale}</p>}
                </TableCell>
                <TableCell className="px-2.5 py-1.5 whitespace-nowrap text-muted-foreground">
                  {skillMetaFor(row.skill)?.label ?? "—"}
                </TableCell>
                <TableCell className="px-2.5 py-1.5 text-center">
                  <Badge className={`rounded border font-semibold ${scoreClasses(score ?? 0)}`}>
                    {score ?? "—"}/3
                  </Badge>
                </TableCell>
              </TableRow>
            );
          })}
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
            className="ms-1 h-auto p-0 underline"
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
            <span className="me-1.5 inline-block size-2 animate-pulse rounded-full bg-red-500" />
            Stop
          </>
        ) : (
          <>
            <MicIcon className="me-1 size-3.5" />
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
    <ScrollArea className="h-full shrink-0 bg-muted/25 md:border-e">
      <div className="mx-auto flex w-full max-w-prose flex-col gap-4 p-4 sm:px-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <BookOpenIcon className="size-3 text-indigo-400" />
            <span className="text-xs font-semibold tracking-widest text-indigo-400 uppercase">
              Case Vignette
            </span>
          </div>
          <TtsButton text={caseBody} label="Listen" />
        </div>
        <div className="text-sm leading-relaxed">
          <Streamdown>{caseBody}</Streamdown>
        </div>

        <div className="mt-auto flex flex-col gap-3">
          <div className="border-t pt-3">
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              <PencilIcon className="size-3" />
              Your notes
            </p>
            <Textarea
              aria-label="Case notes"
              className="min-h-14 resize-none p-2.5 text-xs leading-relaxed"
              placeholder="Jot notes as you reason through the case…"
              value={notes}
              onChange={(e) => onNotesChange(e.target.value)}
            />
          </div>
          {sources.length > 0 && (
            <div className="border-t pt-3">
              <p className="mb-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
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
      <CollapsibleTrigger className="group flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-muted">
        <CheckCircle2Icon className="size-3 shrink-0 text-emerald-400" />
        <span className="font-medium text-emerald-300/90">Q{index + 1}</span>
        <span className="flex-1 truncate text-muted-foreground">
          {truncate(exchange.question ?? "", 52)}
        </span>
        <SkillsetBadges exchange={exchange} />
        <ChevronDownIcon className="size-3 text-muted-foreground transition-transform group-data-panel-open:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-1.5 border-t px-3 py-2.5 text-xs">
        <p className="text-sm font-medium">{exchange.question}</p>
        {exchange.answer && (
          <p className="text-muted-foreground">
            <span className="font-medium text-foreground/60">Your answer: </span>
            {exchange.answer}
          </p>
        )}
        {exchange.feedback && <Streamdown>{exchange.feedback}</Streamdown>}
        <FeedbackDetails
          idealResponse={exchange.ideal_response}
          citations={asArray<CaseSource>(exchange.citations)}
        />
      </CollapsibleContent>
    </Collapsible>
  );
}

function LastFeedbackCard({ exchange, index }: { exchange: OralBoardsExchange; index: number }) {
  return (
    <div className="flex shrink-0 flex-col gap-1.5 rounded-lg border p-3 text-sm">
      <p className="text-xs font-semibold tracking-widest text-emerald-400 uppercase">
        Q{index + 1} · Feedback
      </p>
      <SkillsetBadges exchange={exchange} />
      <p className="font-medium">{exchange.question}</p>
      {exchange.answer && (
        <p className="text-xs text-muted-foreground">Your answer: {exchange.answer}</p>
      )}
      {exchange.feedback && <Streamdown>{exchange.feedback}</Streamdown>}
      <FeedbackDetails
        idealResponse={exchange.ideal_response}
        citations={asArray<CaseSource>(exchange.citations)}
      />
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
        <p className="text-xs text-muted-foreground">
          Read and analyze the case. Take notes before beginning.
        </p>
        <TtsButton text={caseBody} label="Present case" />
      </div>

      <ScrollArea className="min-h-0 flex-1 rounded-lg border bg-muted/20">
        <div className="p-4 sm:p-5">
          <div className="text-sm leading-relaxed">
            <Streamdown>{caseBody}</Streamdown>
          </div>
          {sources.length > 0 && (
            <div className="mt-4 border-t pt-3">
              <CitationChips sources={sources} />
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="flex shrink-0 flex-col gap-2">
        <p className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
          Your Notes
        </p>
        {recorder.micSupported && <CopilotChatAudioRecorder ref={recorder.recorderRef} />}
        <Textarea
          aria-label="Case notes"
          className="min-h-16 resize-none p-3 text-sm"
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

function ExamTimeline({
  questionNumber,
  stage,
}: {
  questionNumber: number;
  stage: "question" | "reviewing" | "scoring" | "complete";
}) {
  const timelineSteps = [
    {
      key: "case",
      label: "Case",
      state: "completed" as const,
    },
    {
      key: "question",
      label: `Question ${Math.max(questionNumber, 1)}`,
      state:
        stage === "question"
          ? ("active" as const)
          : stage === "reviewing" || stage === "scoring" || stage === "complete"
            ? ("completed" as const)
            : ("upcoming" as const),
    },
    {
      key: "reviewing",
      label: "Reviewing",
      state:
        stage === "reviewing"
          ? ("active" as const)
          : stage === "scoring" || stage === "complete"
            ? ("completed" as const)
            : ("upcoming" as const),
    },
    {
      key: "complete",
      label: "Complete",
      state:
        stage === "scoring" || stage === "complete" ? ("active" as const) : ("upcoming" as const),
    },
  ];

  return (
    <ol aria-label="Exam progress" className="flex flex-wrap items-center gap-2 text-xs">
      {timelineSteps.map((step) => {
        const isCompleted = step.state === "completed";
        const isActive = step.state === "active";
        const labelClasses = isCompleted
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
          : isActive
            ? "border-indigo-500/40 bg-indigo-500/10 text-indigo-200"
            : "border-border/60 bg-muted/30 text-muted-foreground";

        return (
          <li key={step.key} className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 ${labelClasses}`}
            >
              {isCompleted && <CheckCircle2Icon className="size-3" />}
              <span aria-current={isActive ? "step" : undefined}>{step.label}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

// "Examiner is thinking" placeholder shown until the next question streams in.
function ThinkingState({ isRunning, loadingStep }: { isRunning: boolean; loadingStep: string }) {
  return (
    <div className="flex items-center gap-2.5 text-muted-foreground">
      <span className="flex gap-1">
        <span className="size-1.5 animate-pulse rounded-full bg-current" />
        <span className="size-1.5 animate-pulse rounded-full bg-current" />
        <span className="size-1.5 animate-pulse rounded-full bg-current" />
      </span>
      <span className="text-sm italic">
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
    <div className="flex shrink-0 flex-col gap-1.5 rounded-lg border border-dashed p-3 text-sm">
      <p className="text-xs font-semibold tracking-widest text-amber-400 uppercase">
        Feedback · generating…
      </p>
      <Streamdown>{activeFeedback}</Streamdown>
      <FeedbackDetails idealResponse={activeIdealResponse} citations={[]} />
    </div>
  );
}

function ReviewingAnswer({ answer, loadingStep }: { answer: string; loadingStep: string }) {
  return (
    <div className="flex shrink-0 flex-col gap-3 rounded-xl border bg-muted/15 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
          Your response
        </p>
        <p role="status" className="text-xs text-muted-foreground">
          {loadingStep}
        </p>
      </div>
      <p className="text-sm leading-relaxed">{answer}</p>
    </div>
  );
}

function ExamProgressHeader({
  questionNumber,
  stage,
  transcript,
}: {
  questionNumber: number;
  stage: "question" | "reviewing" | "scoring" | "complete";
  transcript: OralBoardsExchange[];
}) {
  return (
    <div className="shrink-0 border-b px-4 py-2">
      <div className="flex flex-col gap-2">
        <span className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
          Examination
        </span>
        <ExamTimeline questionNumber={questionNumber} stage={stage} />
      </div>
      {transcript.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {[
            ...new Set(
              transcript.map((x) => safeString(x.skillset)).filter((v): v is string => v != null),
            ),
          ].map((skillset) => {
            const scores = transcript
              .filter((x) => x.skillset === skillset)
              .map((x) => scoreNumber(x.score))
              .filter((s): s is number => s != null);
            const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
            return (
              <Badge
                key={skillset}
                variant="secondary"
                className={`py-0 text-xs ${avg != null ? scoreClasses(Math.round(avg)) : ""}`}
              >
                {skillset}
                {avg != null && <span className="ms-1 opacity-70">{avg.toFixed(1)}</span>}
              </Badge>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Completed exchanges plus the live feedback stream. Returns null when there
// is nothing to show yet (first question, nothing streaming).
function TranscriptSection({
  transcript,
  isRunning,
  activeFeedback,
  activeIdealResponse,
}: {
  transcript: OralBoardsExchange[];
  isRunning: boolean;
  activeFeedback: string;
  activeIdealResponse: string;
}) {
  const olderExchanges = transcript.slice(0, -1);
  const lastExchange = transcript.at(-1);
  if (![olderExchanges.length > 0, lastExchange, activeFeedback].some(Boolean)) return null;
  return (
    <div className="flex flex-col gap-1.5">
      {olderExchanges.map((x, i) => (
        <CompletedExchangeRow key={x.question || i} exchange={x} index={i} />
      ))}
      {lastExchange && <LastFeedbackCard exchange={lastExchange} index={transcript.length - 1} />}
      {isRunning && (
        <LiveFeedbackPreview
          activeFeedback={activeFeedback}
          activeIdealResponse={activeIdealResponse}
        />
      )}
    </div>
  );
}

function ExaminerQuestionCard({
  question,
  probe = "",
  questionNumber,
  isRunning,
  loadingStep,
}: {
  question: string;
  probe?: string;
  questionNumber: number;
  isRunning: boolean;
  loadingStep: string;
}) {
  // A follow-up probe supersedes the original question as the active prompt.
  // Coerce defensively: both props ultimately trace back to LLM-written
  // state, which can carry a non-string value despite the declared type.
  const probeText = asText(probe);
  const questionText = asText(question);
  const isProbe = Boolean(probeText.trim());
  const activeText = isProbe ? probeText : questionText;
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <Avatar
            className={`size-8 ring-1 ${isProbe ? "ring-amber-500/30" : "ring-indigo-500/30"}`}
          >
            <AvatarFallback
              className={
                isProbe ? "bg-amber-500/15 text-amber-300" : "bg-indigo-500/15 text-indigo-300"
              }
            >
              <StethoscopeIcon className="size-4" />
            </AvatarFallback>
          </Avatar>
          <div className="leading-tight">
            <p className="text-xs font-semibold tracking-widest text-indigo-300/80 uppercase">
              Examiner
            </p>
            <p className="text-xs text-muted-foreground">
              Q{questionNumber}
              {isProbe && <span className="text-amber-300/90"> · Follow-up</span>}
            </p>
          </div>
        </div>
        {activeText && <TtsButton text={activeText} label="Listen" />}
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {isProbe && questionText && (
          <p className="text-xs leading-relaxed text-muted-foreground">{questionText}</p>
        )}
        {activeText ? (
          <p className="text-base leading-relaxed font-medium text-pretty">{activeText}</p>
        ) : (
          <ThinkingState isRunning={isRunning} loadingStep={loadingStep} />
        )}
      </CardContent>
    </Card>
  );
}

// Invisible anchor that keeps the newest exam content in view: scrolls when
// the feed signal changes, but never on initial mount.
function ScrollToLatest({ signal }: { signal: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const previousSignalRef = useRef(signal);
  useEffect(() => {
    if (previousSignalRef.current === signal) return;
    previousSignalRef.current = signal;
    ref.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [signal]);
  return <div ref={ref} aria-hidden="true" />;
}

function ResponseComposer({
  submittedAnswer,
  isRunning,
  isScoring,
  reviewingStatus,
  answerText,
  setAnswerText,
  recorder,
  onSubmit,
}: {
  submittedAnswer: string;
  isRunning: boolean;
  isScoring: boolean;
  reviewingStatus: string;
  answerText: string;
  setAnswerText: React.Dispatch<React.SetStateAction<string>>;
  recorder: UseAnswerRecorder;
  onSubmit: () => void;
}) {
  if (submittedAnswer && isRunning) {
    return <ReviewingAnswer answer={submittedAnswer} loadingStep={reviewingStatus} />;
  }
  if (isScoring) {
    return (
      <div className="rounded-xl border bg-muted/15 p-3">
        <p role="status" className="text-sm text-muted-foreground">
          Computing score card…
        </p>
      </div>
    );
  }
  return (
    <div className="flex shrink-0 flex-col gap-2 rounded-xl border bg-muted/15 p-3 md:min-h-0 md:flex-1">
      <div className="flex shrink-0 items-center justify-between">
        <p className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
          Your response
        </p>
        <RecordButton recorder={recorder} />
      </div>

      {recorder.micSupported && <CopilotChatAudioRecorder ref={recorder.recorderRef} />}

      <Textarea
        aria-label="Your answer"
        className="h-24 resize-none p-3 text-sm md:h-auto md:min-h-20 md:flex-1"
        placeholder="Type your answer…"
        value={answerText}
        onChange={(e) => setAnswerText(e.target.value)}
        disabled={isRunning || recorder.recording}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onSubmit();
        }}
      />

      <div className="flex shrink-0 items-center justify-between">
        <span className="hidden items-center gap-1 text-xs text-muted-foreground md:flex">
          <Kbd>⌘</Kbd>
          <Kbd>↵</Kbd>
          <span className="ms-0.5">to submit</span>
        </span>
        <Button
          type="button"
          size="sm"
          disabled={isRunning || !answerText.trim()}
          onClick={onSubmit}
          className="ms-auto"
        >
          <SendHorizontalIcon className="size-3.5" />
          Submit
        </Button>
      </div>
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
  activeProbe = "",
  stateQuestion = "",
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
  activeProbe?: string;
  stateQuestion?: string;
}) {
  const { currentQuestion } = useOralBoardsQuestion();
  // RequestInput registration temporarily mirrors a probe into the client
  // question context. Keep the backend's original current_question as the
  // parent prompt so the follow-up is not rendered twice.
  const question =
    activeProbe.trim() && currentQuestion.trim() === activeProbe.trim()
      ? stateQuestion
      : currentQuestion || stateQuestion;
  const isMobile = useIsMobile();
  const [answerText, setAnswerText] = useState("");
  // A new probe is a new active prompt even though the question is unchanged.
  const activePrompt = JSON.stringify([question, activeProbe]);
  const [submission, setSubmission] = useState({ prompt: "", answer: "" });
  const submittedAnswer = submission.prompt === activePrompt ? submission.answer : "";

  const isScoring = isRunning && loadingStep === "Computing score card…";
  const stage: "question" | "reviewing" | "scoring" | "complete" = isScoring
    ? "scoring"
    : submittedAnswer && isRunning
      ? "reviewing"
      : "question";
  const displayedQuestionNumber = isScoring
    ? Math.max(transcript.length, 1)
    : question
      ? transcript.length + 1
      : Math.max(transcript.length, 1);
  const reviewingStatus =
    stage === "scoring" ? "Computing score card…" : loadingStep || "Reviewing your answer…";

  const recorder = useAnswerRecorder((text) => {
    setAnswerText((prev) => (prev ? `${prev} ${text}` : text));
  });

  const handleSubmit = () => {
    const trimmed = answerText.trim();
    if (!trimmed || isRunning) return;
    setSubmission({ prompt: activePrompt, answer: trimmed });
    onAnswer(trimmed);
    setAnswerText("");
  };

  const hasHistory = transcript.length > 0 || Boolean(isRunning && activeFeedback.trim());

  const composer = (
    <ResponseComposer
      submittedAnswer={submittedAnswer}
      isRunning={isRunning}
      isScoring={isScoring}
      reviewingStatus={reviewingStatus}
      answerText={answerText}
      setAnswerText={setAnswerText}
      recorder={recorder}
      onSubmit={handleSubmit}
    />
  );

  // Mobile: no room for side-by-side panes — the case vignette and the exam
  // live on separate tabs, with the composer pinned below the exam scroll.
  if (isMobile) {
    return (
      <Tabs defaultValue="exam" className="h-full gap-0">
        <div className="shrink-0 border-b px-3 py-2">
          <TabsList className="w-full">
            <TabsTrigger value="case">
              <BookOpenIcon />
              Case
            </TabsTrigger>
            <TabsTrigger value="exam">
              <StethoscopeIcon />
              Exam
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="case" className="min-h-0 flex-1 overflow-hidden">
          <VignettePanel
            caseBody={caseBody}
            sources={sources}
            notes={notes}
            onNotesChange={onNotesChange}
          />
        </TabsContent>
        {/* keepMounted so an in-progress recording survives a peek at the case */}
        <TabsContent value="exam" keepMounted className="flex min-h-0 flex-1 flex-col">
          <ExamProgressHeader
            questionNumber={displayedQuestionNumber}
            stage={stage}
            transcript={transcript}
          />
          <ScrollArea className="min-h-0 flex-1">
            <div className="flex flex-col gap-3 p-3">
              <TranscriptSection
                transcript={transcript}
                isRunning={isRunning}
                activeFeedback={activeFeedback}
                activeIdealResponse={activeIdealResponse}
              />
              {!isScoring && (
                <>
                  <ExaminerQuestionCard
                    question={question}
                    probe={activeProbe}
                    questionNumber={displayedQuestionNumber}
                    isRunning={isRunning}
                    loadingStep={loadingStep}
                  />
                  <AnswerCoach />
                </>
              )}
              <ScrollToLatest
                signal={`${transcript.length}:${activePrompt}:${activeFeedback.trim() ? "streaming" : ""}`}
              />
            </div>
          </ScrollArea>
          <div className="shrink-0 border-t bg-background p-3">{composer}</div>
        </TabsContent>
      </Tabs>
    );
  }

  const questionAndComposer = (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-3 p-4">
        {!isScoring && (
          <>
            <ExaminerQuestionCard
              question={question}
              probe={activeProbe}
              questionNumber={displayedQuestionNumber}
              isRunning={isRunning}
              loadingStep={loadingStep}
            />
            <AnswerCoach />
          </>
        )}
        {composer}
      </div>
    </ScrollArea>
  );

  return (
    <ResizablePanelGroup orientation="horizontal" className="h-full">
      {/* Left: case vignette — pinned, always in view */}
      <ResizablePanel defaultSize="42%" minSize="28%" maxSize="60%">
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
          <ExamProgressHeader
            questionNumber={displayedQuestionNumber}
            stage={stage}
            transcript={transcript}
          />

          {hasHistory ? (
            <ResizablePanelGroup orientation="vertical" className="min-h-0 flex-1">
              <ResizablePanel>
                <ScrollArea className="h-full border-b">
                  <div className="px-4 py-3">
                    <TranscriptSection
                      transcript={transcript}
                      isRunning={isRunning}
                      activeFeedback={activeFeedback}
                      activeIdealResponse={activeIdealResponse}
                    />
                    <ScrollToLatest
                      signal={`${transcript.length}:${activeFeedback.trim() ? "streaming" : ""}`}
                    />
                  </div>
                </ScrollArea>
              </ResizablePanel>
              <ResizableHandle withHandle />

              {/* Active question + response composer */}
              <ResizablePanel>{questionAndComposer}</ResizablePanel>
            </ResizablePanelGroup>
          ) : (
            // First question: no transcript yet, so give the examiner card and
            // composer the full column instead of an empty top pane.
            <div className="min-h-0 flex-1">{questionAndComposer}</div>
          )}
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
    <div className="flex flex-col gap-4">
      {outcome && <OutcomeBanner outcome={outcome} />}
      {scoreSummary.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {scoreSummary.length} skillset{scoreSummary.length === 1 ? "" : "s"} assessed · scored
          independently on the ABPD 1–3 scale
        </p>
      )}
      <ScoreSummaryTable summary={scoreSummary} />
      {scoreCard.trim() && <Streamdown key={scoreCard}>{scoreCard}</Streamdown>}
      {transcript.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2
            id="question-review-heading"
            className="text-xs font-semibold tracking-widest text-muted-foreground uppercase"
          >
            Question review
          </h2>
          <div className="flex flex-col gap-2" aria-labelledby="question-review-heading">
            {transcript.map((exchange, index) => (
              <CompletedExchangeRow
                key={exchange.question || index}
                exchange={exchange}
                index={index}
              />
            ))}
          </div>
        </div>
      )}
      {isEmpty ? (
        <p className="text-sm text-muted-foreground">No feedback yet.</p>
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
}: {
  state: OralBoardsState;
  onClose: () => void;
  onReady: () => void;
  onAnswer: (text: string) => void;
  isRunning: boolean;
}) {
  const { status, caseBody, sources, transcript, scoreCard, scoreSummary, outcome } =
    normalizeState(state);

  // Scratch notes persist across presenting → questioning so the candidate
  // keeps what they jotted while reading the case.
  const [notes, setNotes] = useState("");
  const loadingStep = asText(state.loading_step);
  const activeFeedback = asText(state.active_feedback);
  const activeIdealResponse = asText(state.active_ideal_response);

  const showFinalFeedback = status === "complete" || Boolean(scoreCard.trim());
  const isExamActive = (status === "questioning" || status === "feedback") && !showFinalFeedback;

  return (
    <Artifact className="h-full min-h-0 flex-1 rounded-none border-0">
      <ArtifactHeader>
        <ArtifactTitle>Oral board</ArtifactTitle>
      </ArtifactHeader>
      <ArtifactContent
        className={
          isExamActive
            ? "flex overflow-hidden p-0"
            : status === "presenting"
              ? "flex flex-col overflow-hidden"
              : "flex flex-col gap-4"
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
        {isExamActive && (
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
            activeProbe={asText(state.active_probe)}
            stateQuestion={asText(state.current_question)}
          />
        )}
        {showFinalFeedback && (
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
