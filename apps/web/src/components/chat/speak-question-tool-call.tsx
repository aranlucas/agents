"use client";

import { useCallback, useState } from "react";
import { PlayIcon, SquareIcon, Volume2Icon } from "lucide-react";

import { Button, Tool, ToolContent, ToolHeader } from "@agents/ui";
import { speakQuestion, stopSpeaking } from "@/lib/copilotkit/speak-question";
import { toToolState } from "./tool-adapter";

export type SpeakQuestionToolParams = {
  question?: string;
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
  const [playing, setPlaying] = useState(false);
  const toggle = useCallback(() => {
    const question = parameters.question?.trim();
    if (!question) return;
    if (playing) {
      stopSpeaking();
      setPlaying(false);
    } else {
      setPlaying(true);
      void speakQuestion(question).finally(() => setPlaying(false));
    }
  }, [parameters.question, playing]);
  const resultText = typeof result === "string" ? result : "";

  return (
    <Tool>
      <ToolHeader type="dynamic-tool" toolName="ask_question" state={toToolState(status)} />
      <ToolContent>
        <div className="flex flex-col gap-3 border-t p-3">
          <div className="flex items-start gap-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground">
              <Volume2Icon className="size-4" />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Examiner question
              </p>
              <p className="text-sm leading-relaxed">
                {parameters.question ?? "Preparing audio..."}
              </p>
            </div>
            {status === "complete" && (
              <Button type="button" variant="outline" size="sm" className="gap-2" onClick={toggle}>
                {playing ? <SquareIcon className="size-3.5" /> : <PlayIcon className="size-3.5" />}
                {playing ? "Stop" : "Play"}
              </Button>
            )}
          </div>
          {resultText && <p className="text-xs text-muted-foreground">{resultText}</p>}
        </div>
      </ToolContent>
    </Tool>
  );
}
