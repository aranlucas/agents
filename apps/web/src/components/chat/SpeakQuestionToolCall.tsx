"use client";

import { useCallback } from "react";
import { RotateCcwIcon, Volume2Icon } from "lucide-react";

import { Button } from "@agents/ui";
import { Tool, ToolContent, ToolHeader } from "@/components/ai-elements/tool";
import { speakQuestion } from "@/lib/copilotkit/speak-question";
import { toToolState } from "./tool-adapter";

export type SpeakQuestionToolParams = {
  question?: string;
  purpose?: string;
  evaluationFocus?: string;
  sourceBasis?: string;
};

const EMPTY_PARAMS: SpeakQuestionToolParams = {};

export function SpeakQuestionToolCall({
  status,
  parameters = EMPTY_PARAMS,
  result,
}: {
  status: "inProgress" | "executing" | "complete";
  parameters?: SpeakQuestionToolParams;
  result?: unknown;
}) {
  const replay = useCallback(() => {
    const question = parameters.question?.trim();
    if (question) void speakQuestion(question);
  }, [parameters.question]);
  const resultText = typeof result === "string" ? result : "";

  return (
    <Tool>
      <ToolHeader type="dynamic-tool" toolName="speak_question" state={toToolState(status)} />
      <ToolContent>
        <div className="space-y-3 border-t px-3 py-3">
          <div className="flex items-start gap-3">
            <div className="border-border bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-md border">
              <Volume2Icon className="size-4" />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                Spoken examiner question
              </p>
              <p className="text-sm leading-relaxed">
                {parameters.question ?? "Preparing audio..."}
              </p>
            </div>
            {status === "complete" && (
              <Button type="button" variant="outline" size="sm" className="gap-2" onClick={replay}>
                <RotateCcwIcon className="size-3.5" />
                Replay
              </Button>
            )}
          </div>

          {(parameters.purpose || parameters.evaluationFocus || parameters.sourceBasis) && (
            <dl className="grid gap-2 text-xs sm:grid-cols-3">
              {parameters.purpose && (
                <div>
                  <dt className="text-muted-foreground font-medium">Purpose</dt>
                  <dd className="mt-0.5 leading-relaxed">{parameters.purpose}</dd>
                </div>
              )}
              {parameters.evaluationFocus && (
                <div>
                  <dt className="text-muted-foreground font-medium">Focus</dt>
                  <dd className="mt-0.5 leading-relaxed">{parameters.evaluationFocus}</dd>
                </div>
              )}
              {parameters.sourceBasis && (
                <div>
                  <dt className="text-muted-foreground font-medium">Basis</dt>
                  <dd className="mt-0.5 leading-relaxed">{parameters.sourceBasis}</dd>
                </div>
              )}
            </dl>
          )}

          {resultText && <p className="text-muted-foreground text-xs">{resultText}</p>}
        </div>
      </ToolContent>
    </Tool>
  );
}
