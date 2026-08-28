"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Streamdown } from "@agents/ui";
import {
  AlertCircleIcon,
  BookOpenIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  ChevronUpIcon,
  ClipboardListIcon,
  FileDownIcon,
  FileTextIcon,
  GraduationCapIcon,
  Loader2Icon,
  MicIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  PencilIcon,
  PlayIcon,
  SendHorizontalIcon,
  Share2Icon,
  SquareIcon,
  StethoscopeIcon,
} from "lucide-react";
import { CopilotChatAudioRecorder } from "@copilotkit/react-core/v2";

import { OCE_SKILL_LEVELS } from "@agents/types";
import type {
  OralBoardsExchange,
  OralBoardsOutcome,
  OralBoardsSkill,
  OralBoardsSkillsetScore,
  OralBoardsState,
} from "@agents/types";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Alert,
  AlertDescription,
  AlertTitle,
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Kbd,
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
import { cn } from "@agents/ui/lib/utils";
import { Field, FieldDescription, FieldLabel, FieldTitle } from "@agents/ui/components/field";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@agents/ui/components/drawer";
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
import {
  exportOralBoardsReport,
  type OralBoardsExportFormat,
} from "@/components/chat/oral-boards/oral-boards-export";

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

// The report gives the score card its own "Examiner summary" heading, so a
// leading heading written by the model only repeats it. Display-only — the
// exported report still carries the model's markdown verbatim.
function withoutLeadingHeading(markdown: string): string {
  return markdown.replace(/^\s*#{1,6}[^\n]*(\n+|$)/, "");
}

// Accordion item values are positional: an exchange has no stable id, and the
// transcript only ever grows at the end.
function exchangeValue(index: number): string {
  return `q${index + 1}`;
}

// The one place hue is load-bearing. The exam surface is deliberately neutral;
// only the end-of-case report colours scores, where scanning many at once is
// the point. Keep new call sites off this unless they are on that report.
function scoreClasses(score: number): string {
  if (score >= 3) {
    return "border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-800/60 dark:bg-emerald-950/30 dark:text-emerald-200";
  }
  if (score === 2) {
    return "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-200";
  }
  return "border-red-200 bg-red-50 text-red-950 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-200";
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
        <Badge variant="outline" className="rounded text-xs font-semibold">
          {score}/3
        </Badge>
      )}
    </span>
  );
}

// What a 3 sounds like. Always the closing block of an exchange so the gap
// between the candidate's answer and the reference answer reads top-to-bottom.
// Neutral, like the rest of the exam surface — the label carries the meaning.
function ModelAnswer({ text }: { text: string | undefined }) {
  const ideal = asText(text);
  if (!ideal.trim()) return null;
  return (
    <div className="mt-0.5 rounded-lg border border-dashed bg-muted/40 px-2.5 py-2">
      <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        <GraduationCapIcon className="size-3.5" />
        Model answer
      </p>
      <Streamdown>{ideal}</Streamdown>
    </div>
  );
}

// Generic OCE answer-technique guidance — never case-specific, so it is safe
// to render as static content regardless of agent state. Collapsed by
// default so it doesn't compete with the live question for attention.
function AnswerCoach() {
  return (
    <Collapsible className="rounded-lg border border-dashed">
      <CollapsibleTrigger className="group flex w-full items-center justify-between gap-2 px-2.5 py-2 text-start text-xs transition-colors hover:bg-muted">
        <span className="flex items-center gap-1.5 font-medium">
          <GraduationCapIcon className="size-3.5 text-muted-foreground" />
          How to answer like a 3
        </span>
        <ChevronDownIcon className="size-3 text-muted-foreground transition-transform group-data-panel-open:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="typeset typeset-site border-t px-2.5 py-2">
        <ul className="text-muted-foreground">
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
  transcript: OralBoardsExchange[];
  scoreCard: string;
  scoreSummary: OralBoardsSkillsetScore[];
  outcome: OralBoardsOutcome | undefined;
} {
  return {
    status: state.status ?? "idle",
    caseBody: asText(state.case),
    transcript: asArray<OralBoardsExchange>(state.transcript),
    scoreCard: asText(state.score_card),
    scoreSummary: asArray<OralBoardsSkillsetScore>(state.score_summary),
    outcome: state.outcome,
  };
}

const OUTCOME_META: Record<OralBoardsOutcome, { label: string; cls: string }> = {
  pass: {
    label: "On track to pass",
    cls: "border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-800/60 dark:bg-emerald-950/30 dark:text-emerald-200",
  },
  borderline: {
    label: "Borderline",
    cls: "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-200",
  },
  not_yet: {
    label: "Not yet passing",
    cls: "border-red-200 bg-red-50 text-red-950 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-200",
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
  const isMobile = useIsMobile();
  if (summary.length === 0) return null;
  const scoreRowKeyCounts = new Map<string, number>();
  const rows = summary.map((row) => {
    const skillset = safeString(row.skillset) ?? "Unknown skillset";
    const rationale = safeString(row.rationale);
    const score = scoreNumber(row.score);
    const keySeed = `${skillset}-${row.skill ?? "na"}-${score ?? "na"}-${rationale}`;
    const duplicate = scoreRowKeyCounts.get(keySeed) ?? 0;
    scoreRowKeyCounts.set(keySeed, duplicate + 1);
    return {
      key: `${keySeed}-${duplicate + 1}`,
      skillset,
      rationale,
      score,
      skillLabel: skillMetaFor(row.skill)?.label ?? "—",
    };
  });

  if (isMobile) {
    return (
      <div className="flex flex-col gap-2" aria-label="Skillset scores">
        {rows.map((row) => (
          <div key={row.key} className="flex flex-col gap-2 rounded-lg border p-3">
            <div className="flex items-start justify-between gap-3">
              <p className="min-w-0 text-sm font-medium">{row.skillset}</p>
              <Badge
                className={`shrink-0 rounded border font-semibold ${scoreClasses(row.score ?? 0)}`}
              >
                {row.score ?? "—"}/3
              </Badge>
            </div>
            <Badge variant="secondary" className="w-fit text-xs">
              {row.skillLabel}
            </Badge>
            {row.rationale && (
              <p className="line-clamp-3 text-xs leading-relaxed text-muted-foreground">
                {row.rationale}
              </p>
            )}
          </div>
        ))}
      </div>
    );
  }

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
          {rows.map((row) => {
            return (
              <TableRow key={row.key} className="align-top">
                <TableCell className="px-2.5 py-1.5">
                  <p className="font-medium">{row.skillset}</p>
                  {row.rationale && <p className="mt-0.5 text-muted-foreground">{row.rationale}</p>}
                </TableCell>
                <TableCell className="px-2.5 py-1.5 whitespace-nowrap text-muted-foreground">
                  {row.skillLabel}
                </TableCell>
                <TableCell className="px-2.5 py-1.5 text-center">
                  <Badge className={`rounded border font-semibold ${scoreClasses(row.score ?? 0)}`}>
                    {row.score ?? "—"}/3
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

type AnswerRecorderControls = Omit<UseAnswerRecorder, "recorderRef">;

function RecordButton({ recorder }: { recorder: AnswerRecorderControls }) {
  const {
    recording,
    transcribing,
    micSupported,
    micPermission,
    error,
    clearError,
    requestPermission,
    toggle,
  } = recorder;
  if (!micSupported) return null;

  const permissionPending = micPermission === "checking" || micPermission === "requesting";
  const permissionDenied = micPermission === "denied";
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
        aria-label={
          micPermission === "checking"
            ? "Checking microphone permission"
            : micPermission === "requesting"
              ? "Requesting microphone permission"
              : undefined
        }
        onClick={() => {
          if (micPermission === "prompt") {
            void requestPermission();
            return;
          }
          void toggle();
        }}
        disabled={transcribing || permissionPending || permissionDenied}
        className={recording ? "border-red-500 text-red-500" : ""}
      >
        {transcribing ? (
          <Loader2Icon className="size-3.5 animate-spin" />
        ) : permissionPending ? (
          <>
            <Loader2Icon className="me-1 size-3.5 animate-spin" />
            {micPermission === "checking" ? "Checking microphone" : "Requesting access"}
          </>
        ) : permissionDenied ? (
          <>
            <MicIcon className="me-1 size-3.5" />
            Microphone blocked
          </>
        ) : micPermission === "prompt" ? (
          <>
            <MicIcon className="me-1 size-3.5" />
            Enable microphone
          </>
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

// The case rail during questioning — a stable reference surface the candidate
// reads from, with their running notes editable beneath it.
function VignettePanel({
  caseBody,
  notes,
  onNotesChange,
}: {
  caseBody: string;
  notes: string;
  onNotesChange: React.Dispatch<React.SetStateAction<string>>;
}) {
  // Only the vignette scrolls. Notes stay docked at the foot of the rail so
  // jotting something never costs you your place in a long case.
  return (
    <div className="flex size-full min-w-0 flex-col bg-muted/25">
      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto flex w-full max-w-prose flex-col gap-4 p-4 sm:px-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <BookOpenIcon className="size-3 text-muted-foreground" />
              <span className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
                Case Vignette
              </span>
            </div>
            <TtsButton text={caseBody} label="Listen" />
          </div>
          <Streamdown>{caseBody}</Streamdown>
        </div>
      </ScrollArea>

      <div className="flex shrink-0 flex-col gap-3 border-t p-4 sm:px-5">
        <Field>
          <FieldLabel
            htmlFor="oral-boards-notes"
            className="text-xs tracking-wide text-muted-foreground uppercase"
          >
            <PencilIcon className="size-3" />
            Your notes
          </FieldLabel>
          <Textarea
            id="oral-boards-notes"
            aria-label="Case notes"
            className="min-h-14 resize-none bg-background p-2.5 text-xs leading-relaxed"
            placeholder="Jot notes as you reason through the case…"
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
          />
        </Field>
        <AnswerCoach />
      </div>
    </div>
  );
}

// One graded exchange as an Accordion item. The parent Accordion decides what
// is open: everything on the review screen, nothing in the exam drawer.
function CompletedExchangeItem({
  exchange,
  index,
}: {
  exchange: OralBoardsExchange;
  index: number;
}) {
  return (
    <AccordionItem
      value={exchangeValue(index)}
      className="overflow-hidden rounded-lg border not-last:border-b"
    >
      <AccordionTrigger className="items-center gap-2 px-3 py-2 text-xs hover:bg-muted hover:no-underline">
        <CheckCircle2Icon className="size-3 shrink-0 text-muted-foreground" />
        <span className="font-medium">Q{index + 1}</span>
        <span className="flex-1 truncate text-muted-foreground">
          {truncate(exchange.question ?? "", 52)}
        </span>
        <SkillsetBadges exchange={exchange} />
      </AccordionTrigger>
      <AccordionContent className="flex flex-col gap-1.5 border-t px-3 py-2.5 text-xs">
        <p className="text-sm font-medium">{exchange.question}</p>
        {exchange.answer && (
          <p className="text-muted-foreground">
            <span className="font-medium text-foreground/60">Your answer: </span>
            {exchange.answer}
          </p>
        )}
        {exchange.feedback && <Streamdown>{exchange.feedback}</Streamdown>}
        <ModelAnswer text={exchange.ideal_response} />
      </AccordionContent>
    </AccordionItem>
  );
}

function LastFeedbackCard({ exchange, index }: { exchange: OralBoardsExchange; index: number }) {
  return (
    <div className="flex shrink-0 flex-col gap-1.5 rounded-lg border p-3 text-sm">
      <p className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
        Q{index + 1} · Feedback
      </p>
      <SkillsetBadges exchange={exchange} />
      <p className="font-medium">{exchange.question}</p>
      {exchange.answer && (
        <p className="text-xs text-muted-foreground">Your answer: {exchange.answer}</p>
      )}
      {exchange.feedback && <Streamdown>{exchange.feedback}</Streamdown>}
      <ModelAnswer text={exchange.ideal_response} />
    </div>
  );
}

function PresentingPane({
  caseBody,
  onReady,
  notes,
  onNotesChange,
}: {
  caseBody: string;
  onReady: () => void;
  notes: string;
  onNotesChange: React.Dispatch<React.SetStateAction<string>>;
}) {
  const appendTranscript = useCallback(
    (text: string) => onNotesChange((prev) => (prev ? `${prev} ${text}` : text)),
    [onNotesChange],
  );
  const { recorderRef, ...recorder } = useAnswerRecorder(appendTranscript);

  return (
    <div className="mx-auto flex size-full max-w-3xl flex-col gap-4">
      <div className="flex shrink-0 items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Read and analyze the case. Take notes before beginning.
        </p>
        <TtsButton text={caseBody} label="Present case" />
      </div>

      <ScrollArea className="min-h-0 flex-1 rounded-lg border bg-muted/20">
        <div className="p-4 sm:p-5">
          <Streamdown>{caseBody}</Streamdown>
        </div>
      </ScrollArea>

      <div className="flex shrink-0 flex-col gap-2">
        <p className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
          Your Notes
        </p>
        {recorder.micSupported && (
          <div className="hidden" aria-hidden="true">
            <CopilotChatAudioRecorder ref={recorderRef} />
          </div>
        )}
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
          ? "border-border bg-muted text-muted-foreground"
          : isActive
            ? "border-foreground/30 bg-background font-medium text-foreground"
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
      <p className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
        Feedback · generating…
      </p>
      <Streamdown>{activeFeedback}</Streamdown>
      <ModelAnswer text={activeIdealResponse} />
    </div>
  );
}

function ReviewingAnswer({ answer, loadingStep }: { answer: string; loadingStep: string }) {
  return (
    <Field className="max-h-56 overflow-y-auto">
      <div className="flex items-center justify-between gap-2">
        <FieldTitle>Your response</FieldTitle>
        <p role="status" className="text-xs text-muted-foreground">
          {loadingStep}
        </p>
      </div>
      <p className="text-sm leading-relaxed">{answer}</p>
    </Field>
  );
}

function ExamProgressHeader({
  questionNumber,
  stage,
  transcript,
  caseOpen,
  onToggleCase,
}: {
  questionNumber: number;
  stage: "question" | "reviewing" | "scoring" | "complete";
  transcript: OralBoardsExchange[];
  caseOpen: boolean;
  onToggleCase: () => void;
}) {
  const runningScores = [
    ...new Set(transcript.map((x) => safeString(x.skillset)).filter((v): v is string => v != null)),
  ].map((skillset) => {
    const scores = transcript
      .filter((x) => x.skillset === skillset)
      .map((x) => scoreNumber(x.score))
      .filter((s): s is number => s != null);
    return {
      skillset,
      avg: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
    };
  });

  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b px-4 py-2">
      <ExamTimeline questionNumber={questionNumber} stage={stage} />
      <div className="flex flex-wrap items-center gap-1">
        {runningScores.map(({ skillset, avg }) => (
          <Badge key={skillset} variant="secondary" className="py-0 text-xs">
            {skillset}
            {avg != null && <span className="ms-1 font-semibold">{avg.toFixed(1)}</span>}
          </Badge>
        ))}
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={onToggleCase}
          className="ms-1 text-muted-foreground"
        >
          {caseOpen ? (
            <PanelLeftCloseIcon className="size-3.5" />
          ) : (
            <PanelLeftOpenIcon className="size-3.5" />
          )}
          {caseOpen ? "Hide case" : "Show case"}
        </Button>
      </div>
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
      {olderExchanges.length > 0 && (
        <Accordion multiple className="flex flex-col gap-1.5">
          {olderExchanges.map((x, i) => (
            <CompletedExchangeItem key={x.question || i} exchange={x} index={i} />
          ))}
        </Accordion>
      )}
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

function MobileExamProgress({
  questionNumber,
  stage,
  scoredCount,
}: {
  questionNumber: number;
  stage: "question" | "reviewing" | "scoring" | "complete";
  scoredCount: number;
}) {
  const stageLabel =
    stage === "reviewing"
      ? "Reviewing answer"
      : stage === "scoring"
        ? "Grading"
        : stage === "complete"
          ? "Complete"
          : "Answering";

  return (
    <div
      aria-label="Exam progress"
      className="flex shrink-0 items-center justify-between gap-3 border-b px-3 py-2"
    >
      <div className="flex min-w-0 items-baseline gap-2">
        <p className="truncate text-sm font-medium">Question {questionNumber}</p>
        <p className="shrink-0 text-xs text-muted-foreground">{scoredCount} scored</p>
      </div>
      <Badge variant={stage === "question" ? "outline" : "secondary"}>{stageLabel}</Badge>
    </div>
  );
}

// Grading lives in a drawer under the composer, closed by default: the real
// OCE gives no feedback between questions, and a graded answer sitting above
// the live question pulls attention backwards. It is one click away, and the
// full write-up is waiting on the end-of-case review.
function FeedbackDrawer({
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
  const hasLiveFeedback = isRunning && Boolean(activeFeedback.trim());
  const [open, setOpen] = useState(false);
  // Grading lands silently while the drawer is shut, so count what arrived
  // since it was last read and clear that the moment it is opened.
  const [readCount, setReadCount] = useState(transcript.length);
  const unread = open ? 0 : Math.max(transcript.length - readCount, 0);
  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) setReadCount(transcript.length);
  };

  if (transcript.length === 0 && !hasLiveFeedback) return null;

  // A sheet, not an inline panel: an inline drawer in a full-height column
  // always ends flush against the window edge, which reads as truncated even
  // when it scrolls. The sheet gets its own height and a real boundary.
  return (
    <Drawer open={open} onOpenChange={handleOpenChange}>
      <DrawerTrigger asChild>
        <button
          type="button"
          className="flex w-full shrink-0 items-center justify-between gap-2 border-t bg-muted/20 px-4 py-2 text-start text-xs transition-colors hover:bg-muted"
        >
          <span className="font-medium">Feedback so far</span>
          <span className="flex items-center gap-2">
            {unread > 0 && <Badge>{unread} new</Badge>}
            <Badge variant="secondary">{transcript.length}</Badge>
            <ChevronUpIcon className="size-3 text-muted-foreground" />
          </span>
        </button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader className="mx-auto w-full max-w-3xl">
          <DrawerTitle>Feedback so far</DrawerTitle>
          <DrawerDescription>
            Grading for the questions you have already answered. The full write-up is on the score
            card at the end of the case.
          </DrawerDescription>
        </DrawerHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8">
          <div className="mx-auto w-full max-w-3xl">
            <TranscriptSection
              transcript={transcript}
              isRunning={isRunning}
              activeFeedback={activeFeedback}
              activeIdealResponse={activeIdealResponse}
            />
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function ExaminerQuestionCard({
  question,
  probe = "",
  questionNumber,
  isRunning,
  loadingStep,
  fill = false,
  children,
}: {
  question: string;
  probe?: string;
  questionNumber: number;
  isRunning: boolean;
  loadingStep: string;
  fill?: boolean;
  children: React.ReactNode;
}) {
  // A follow-up probe supersedes the original question as the active prompt.
  // Coerce defensively: both props ultimately trace back to LLM-written
  // state, which can carry a non-string value despite the declared type.
  const probeText = asText(probe);
  const questionText = asText(question);
  const isProbe = Boolean(probeText.trim());
  const activeText = isProbe ? probeText : questionText;
  return (
    // Question and answer are one Card, not two panes: the examiner asks in
    // the body and you reply in the footer, which is how the exchange actually
    // works. CardFooter's tinted top border does the separating.
    <Card className={fill ? "min-h-0 flex-1" : undefined}>
      {/* `flex` (not `flex-row`) so it replaces CardHeader's own `grid` —
          otherwise justify-between is inert and the Listen button wraps. */}
      <CardHeader className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <Avatar className="size-8 ring-1 ring-border">
            <AvatarFallback className="bg-muted text-muted-foreground">
              <StethoscopeIcon className="size-4" />
            </AvatarFallback>
          </Avatar>
          <div className="leading-tight">
            <p className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
              Examiner
            </p>
            <p className="text-xs text-muted-foreground">
              Q{questionNumber}
              {isProbe && <span className="font-medium text-foreground"> · Follow-up</span>}
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
      <CardFooter className={cn("flex-col items-stretch gap-2", fill && "min-h-0 flex-1")}>
        {children}
      </CardFooter>
    </Card>
  );
}

// Invisible anchor that keeps the newest exam content in view: scrolls when
// the feed signal changes, but never on initial mount.
function ScrollToLatest({
  signal,
  behavior = "smooth",
}: {
  signal: string;
  behavior?: ScrollBehavior;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const previousSignalRef = useRef(signal);
  useEffect(() => {
    if (previousSignalRef.current === signal) return;
    previousSignalRef.current = signal;
    ref.current?.scrollIntoView({ block: "end", behavior });
  }, [behavior, signal]);
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
  recorderRef,
  onSubmit,
}: {
  submittedAnswer: string;
  isRunning: boolean;
  isScoring: boolean;
  reviewingStatus: string;
  answerText: string;
  setAnswerText: React.Dispatch<React.SetStateAction<string>>;
  recorder: AnswerRecorderControls;
  recorderRef: UseAnswerRecorder["recorderRef"];
  onSubmit: () => void;
}) {
  if (submittedAnswer && isRunning) {
    return <ReviewingAnswer answer={submittedAnswer} loadingStep={reviewingStatus} />;
  }
  if (isScoring) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Computing score card…
      </p>
    );
  }
  return (
    <Field className="min-h-0 flex-1">
      <div className="flex shrink-0 items-center justify-between gap-2">
        <FieldLabel htmlFor="oral-boards-answer">Your response</FieldLabel>
        <RecordButton recorder={recorder} />
      </div>

      {recorder.micSupported && (
        <div className="hidden" aria-hidden="true">
          <CopilotChatAudioRecorder ref={recorderRef} />
        </div>
      )}

      <Textarea
        id="oral-boards-answer"
        aria-label="Your answer"
        className="field-sizing-fixed min-h-32 flex-1 resize-none bg-background p-3 text-sm"
        placeholder="Type your answer…"
        value={answerText}
        onChange={(e) => setAnswerText(e.target.value)}
        disabled={isRunning || recorder.recording}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onSubmit();
        }}
      />

      <div aria-label="Answer actions" className="flex shrink-0 items-center justify-between">
        <FieldDescription className="hidden items-center gap-1 text-xs md:flex">
          <Kbd>⌘</Kbd>
          <Kbd>↵</Kbd>
          <span className="ms-0.5">to submit</span>
        </FieldDescription>
        <Button
          type="button"
          size="sm"
          disabled={isRunning || !answerText.trim()}
          onClick={onSubmit}
          className="w-full md:ms-auto md:w-auto"
        >
          <SendHorizontalIcon className="size-3.5" />
          Submit
        </Button>
      </div>
    </Field>
  );
}

function QuestioningPane({
  caseBody,
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
  // The case rail is reference material, not a workspace to arrange — one
  // toggle replaces the drag handle it used to need.
  const [caseOpen, setCaseOpen] = useState(true);
  // A new probe is a new active prompt even though the question is unchanged.
  const activePrompt = JSON.stringify([question, activeProbe]);
  const [submission, setSubmission] = useState({ prompt: "", answer: "", questionNumber: 1 });
  const submittedAnswer = submission.prompt === activePrompt ? submission.answer : "";

  const isScoring = isRunning && loadingStep === "Computing score card…";
  const stage: "question" | "reviewing" | "scoring" | "complete" = isScoring
    ? "scoring"
    : submittedAnswer && isRunning
      ? "reviewing"
      : "question";
  const displayedQuestionNumber = isScoring
    ? Math.max(transcript.length, 1)
    : submittedAnswer && isRunning
      ? submission.questionNumber
      : question
        ? transcript.length + 1
        : Math.max(transcript.length, 1);
  const reviewingStatus =
    stage === "scoring" ? "Computing score card…" : loadingStep || "Reviewing your answer…";

  const appendTranscript = useCallback((text: string) => {
    setAnswerText((prev) => (prev ? `${prev} ${text}` : text));
  }, []);
  const { recorderRef, ...recorder } = useAnswerRecorder(appendTranscript);

  const handleSubmit = () => {
    const trimmed = answerText.trim();
    if (!trimmed || isRunning) return;
    setSubmission({
      prompt: activePrompt,
      answer: trimmed,
      questionNumber: displayedQuestionNumber,
    });
    onAnswer(trimmed);
    setAnswerText("");
  };

  const composer = (
    <ResponseComposer
      submittedAnswer={submittedAnswer}
      isRunning={isRunning}
      isScoring={isScoring}
      reviewingStatus={reviewingStatus}
      answerText={answerText}
      setAnswerText={setAnswerText}
      recorder={recorder}
      recorderRef={recorderRef}
      onSubmit={handleSubmit}
    />
  );

  // Mobile: no room for side-by-side panes — the case vignette and the exam
  // live on separate tabs, with the composer pinned below the exam scroll.
  if (isMobile) {
    return (
      <Tabs defaultValue="exam" className="size-full min-w-0 gap-0">
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
        <TabsContent value="case" className="min-h-0 w-full min-w-0 flex-1 overflow-hidden">
          <VignettePanel caseBody={caseBody} notes={notes} onNotesChange={onNotesChange} />
        </TabsContent>
        {/* keepMounted so an in-progress recording survives a peek at the case */}
        <TabsContent
          value="exam"
          keepMounted
          className="flex min-h-0 w-full min-w-0 flex-1 flex-col"
        >
          <MobileExamProgress
            questionNumber={displayedQuestionNumber}
            stage={stage}
            scoredCount={transcript.length}
          />
          <ScrollArea className="min-h-0 w-full flex-1">
            <div className="flex w-full flex-col gap-3 p-3">
              <ExaminerQuestionCard
                question={question}
                probe={activeProbe}
                questionNumber={displayedQuestionNumber}
                isRunning={isRunning}
                loadingStep={loadingStep}
              >
                {composer}
              </ExaminerQuestionCard>
              <ScrollToLatest signal={activePrompt} behavior="auto" />
            </div>
          </ScrollArea>
          <FeedbackDrawer
            transcript={transcript}
            isRunning={isRunning}
            activeFeedback={activeFeedback}
            activeIdealResponse={activeIdealResponse}
          />
        </TabsContent>
      </Tabs>
    );
  }

  // Desktop: a fixed case rail beside a single exam column. The question and
  // the response dock own the column; grading waits in the drawer beneath.
  return (
    // `size-full`: ArtifactContent is itself a flex row, so without an explicit
    // width this wrapper sizes to its content and the exam column stops short
    // of the window edge — most visibly once the case rail is hidden.
    <div className="flex size-full min-h-0">
      {caseOpen && (
        <div className="flex w-80 shrink-0 flex-col border-e lg:w-96">
          <VignettePanel caseBody={caseBody} notes={notes} onNotesChange={onNotesChange} />
        </div>
      )}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <ExamProgressHeader
          questionNumber={displayedQuestionNumber}
          stage={stage}
          transcript={transcript}
          caseOpen={caseOpen}
          onToggleCase={() => setCaseOpen((open) => !open)}
        />

        <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col p-4">
          <ExaminerQuestionCard
            question={question}
            probe={activeProbe}
            questionNumber={displayedQuestionNumber}
            isRunning={isRunning}
            loadingStep={loadingStep}
            fill
          >
            {composer}
          </ExaminerQuestionCard>
        </div>

        <FeedbackDrawer
          transcript={transcript}
          isRunning={isRunning}
          activeFeedback={activeFeedback}
          activeIdealResponse={activeIdealResponse}
        />
      </div>
    </div>
  );
}

// One rhythm for every section of the report, so the candidate's eye can find
// the same landmarks in each: rule, eyebrow, optional control on the right.
function ReviewSectionHeading({
  children,
  id,
  action,
}: {
  children: React.ReactNode;
  id?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-7 items-center justify-between gap-2 border-b pb-1.5">
      <h2 id={id} className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
        {children}
      </h2>
      {action}
    </div>
  );
}

function FeedbackPane({
  caseBody,
  scoreCard,
  scoreSummary,
  outcome,
  transcript,
  onNewCase,
}: {
  caseBody: string;
  scoreCard: string;
  scoreSummary: OralBoardsSkillsetScore[];
  outcome?: OralBoardsOutcome;
  transcript: OralBoardsExchange[];
  onNewCase: () => void;
}) {
  const isMobile = useIsMobile();
  const [exporting, setExporting] = useState<OralBoardsExportFormat | null>(null);
  const [exportStatus, setExportStatus] = useState("");
  // Review opens with every question expanded — reading the answers back is
  // the point of this screen.
  const allValues = transcript.map((_exchange, index) => exchangeValue(index));
  const [openRows, setOpenRows] = useState<string[]>(allValues);
  const allExpanded = openRows.length === transcript.length;
  const toggleAllRows = () => setOpenRows(allExpanded ? [] : allValues);
  const isEmpty = !scoreCard.trim() && scoreSummary.length === 0 && transcript.length === 0;
  const handleExport = async (format: OralBoardsExportFormat) => {
    if (exporting) return;
    setExporting(format);
    setExportStatus("");
    try {
      const result = await exportOralBoardsReport(format, {
        caseBody,
        scoreCard,
        scoreSummary,
        outcome,
        transcript,
      });
      if (result !== "cancelled") {
        const formatLabel = format === "pdf" ? "PDF" : "Markdown";
        setExportStatus(`${formatLabel} ${result}.`);
      }
    } catch {
      setExportStatus("Could not export the report. Please try again.");
    } finally {
      setExporting(null);
    }
  };
  const questionReviewRows = (
    <Accordion
      multiple
      value={openRows}
      onValueChange={setOpenRows}
      className="flex flex-col gap-2"
      aria-label={isMobile ? "Question review" : undefined}
      aria-labelledby={isMobile ? undefined : "question-review-heading"}
    >
      {transcript.map((exchange, index) => (
        <CompletedExchangeItem key={exchange.question || index} exchange={exchange} index={index} />
      ))}
    </Accordion>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-3 p-3 sm:gap-4 sm:p-4">
          {outcome && <OutcomeBanner outcome={outcome} />}
          {scoreSummary.length > 0 && (
            <div className="flex flex-col gap-2">
              {!isMobile && <ReviewSectionHeading>Skillset scores</ReviewSectionHeading>}
              <p className="text-xs text-muted-foreground">
                {scoreSummary.length} skillset{scoreSummary.length === 1 ? "" : "s"} assessed ·
                scored independently on the ABPD 1–3 scale
              </p>
            </div>
          )}
          <ScoreSummaryTable summary={scoreSummary} />
          {scoreCard.trim() &&
            (isMobile ? (
              <Collapsible className="rounded-lg border">
                <CollapsibleTrigger className="group flex w-full items-center justify-between gap-2 px-3 py-2.5 text-start text-sm transition-colors hover:bg-muted">
                  <span className="font-medium">Examiner summary</span>
                  <ChevronDownIcon className="size-4 text-muted-foreground transition-transform group-data-panel-open:rotate-180" />
                </CollapsibleTrigger>
                <CollapsibleContent className="border-t p-3">
                  <Streamdown className="text-sm leading-relaxed" key={scoreCard}>
                    {withoutLeadingHeading(scoreCard)}
                  </Streamdown>
                </CollapsibleContent>
              </Collapsible>
            ) : (
              // Boxed so the model's own markdown headings read as content
              // inside a section rather than outranking the page's structure.
              <section className="flex flex-col gap-2">
                <ReviewSectionHeading>Examiner summary</ReviewSectionHeading>
                <div className="rounded-lg border p-3">
                  <Streamdown key={scoreCard}>{withoutLeadingHeading(scoreCard)}</Streamdown>
                </div>
              </section>
            ))}
          {transcript.length > 0 && (
            <>
              {isMobile ? (
                <Collapsible className="rounded-lg border">
                  <CollapsibleTrigger className="group flex w-full items-center justify-between gap-2 px-3 py-2.5 text-start text-sm transition-colors hover:bg-muted">
                    <span className="font-medium">Question review</span>
                    <span className="flex items-center gap-2">
                      <Badge variant="secondary">{transcript.length}</Badge>
                      <ChevronDownIcon className="size-4 text-muted-foreground transition-transform group-data-panel-open:rotate-180" />
                    </span>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="border-t p-2">
                    {questionReviewRows}
                  </CollapsibleContent>
                </Collapsible>
              ) : (
                <section className="flex flex-col gap-2">
                  <ReviewSectionHeading
                    id="question-review-heading"
                    action={
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        onClick={toggleAllRows}
                        className="text-muted-foreground"
                      >
                        {allExpanded ? "Collapse all" : "Expand all"}
                      </Button>
                    }
                  >
                    Question review
                  </ReviewSectionHeading>
                  {questionReviewRows}
                </section>
              )}
            </>
          )}
          {isEmpty && (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <ClipboardListIcon />
                </EmptyMedia>
                <EmptyTitle>No feedback yet.</EmptyTitle>
                <EmptyDescription>
                  The examiner writes the score card once the case is complete.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </div>
      </ScrollArea>
      {!isEmpty && (
        <div
          role="group"
          aria-label="Case actions"
          className="flex shrink-0 flex-col gap-2 border-t bg-background p-3 sm:flex-row"
        >
          <DropdownMenu>
            <DropdownMenuTrigger
              disabled={Boolean(exporting)}
              render={(props) => (
                <Button {...props} type="button" variant="outline" className="w-full sm:flex-1">
                  {exporting ? (
                    <Loader2Icon className="size-3.5 animate-spin" />
                  ) : (
                    <Share2Icon className="size-3.5" />
                  )}
                  {exporting ? "Exporting…" : "Export"}
                  <ChevronDownIcon className="ms-auto size-3.5" />
                </Button>
              )}
            />
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={() => void handleExport("pdf")}>
                <FileDownIcon />
                PDF
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void handleExport("markdown")}>
                <FileTextIcon />
                Markdown
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button type="button" className="w-full sm:flex-1" onClick={onNewCase}>
            <PlayIcon className="size-3.5" />
            Start a new case
          </Button>
          <p className="sr-only" aria-live="polite">
            {exportStatus}
          </p>
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
  const { status, caseBody, transcript, scoreCard, scoreSummary, outcome } = normalizeState(state);

  // Scratch notes persist across presenting → questioning so the candidate
  // keeps what they jotted while reading the case.
  const [notes, setNotes] = useState("");
  const loadingStep = asText(state.loading_step);
  const activeFeedback = asText(state.active_feedback);
  const activeIdealResponse = asText(state.active_ideal_response);

  const showFinalFeedback = status === "complete" || Boolean(scoreCard.trim());
  const isExamActive = (status === "questioning" || status === "feedback") && !showFinalFeedback;

  return (
    <Artifact className="size-full min-w-0 flex-1 rounded-none border-0">
      <ArtifactHeader className="px-3 py-2">
        <ArtifactTitle>Oral board</ArtifactTitle>
      </ArtifactHeader>
      <ArtifactContent
        className={
          isExamActive
            ? "flex w-full min-w-0 overflow-hidden p-0"
            : status === "presenting" || showFinalFeedback
              ? "flex flex-col overflow-hidden"
              : "flex flex-col gap-4"
        }
      >
        {status === "presenting" && (
          <PresentingPane
            caseBody={caseBody}
            onReady={onReady}
            notes={notes}
            onNotesChange={setNotes}
          />
        )}
        {isExamActive && (
          <QuestioningPane
            caseBody={caseBody}
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
            caseBody={caseBody}
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
