"use client";

import { useCallback, useState } from "react";
import { PlayIcon, SquareIcon, Volume2Icon } from "lucide-react";

import { Button } from "@agents/ui";
import { Tool, ToolContent, ToolHeader } from "@/components/ai-elements/tool";
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
        <div className="space-y-3 border-t px-3 py-3">
          <div className="flex items-start gap-3">
            <div className="border-border bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-md border">
              <Volume2Icon className="size-4" />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
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
          {resultText && <p className="text-muted-foreground text-xs">{resultText}</p>}
        </div>
      </ToolContent>
    </Tool>
  );
}
