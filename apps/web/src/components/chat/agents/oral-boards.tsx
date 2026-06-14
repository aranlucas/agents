"use client";

import { useFrontendTool } from "@copilotkit/react-core/v2";
import { z } from "zod";

import { SpeakQuestionToolCall } from "@/components/chat/SpeakQuestionToolCall";
import { setCurrentQuestion } from "@/lib/copilotkit/oral-boards-question";
import type { AgentId } from "./registry";

/**
 * Oral-boards console wiring. Registers the `ask_question` frontend tool that
 * voices examiner prompts and captures the live question for the bespoke pane.
 * The Kokoro TTS model is preloaded earlier by the route layout so the first
 * question speaks without a cold-start stall.
 */
export function OralBoardsExtension({ agentId }: { agentId: AgentId }) {
  useFrontendTool(
    {
      name: "ask_question",
      description:
        "Register the current examiner question so it appears in the exam panel. " +
        "Call this once per turn with the exact question text before writing the question in chat. " +
        "Do not call this more than once per turn.",
      available: true,
      agentId,
      parameters: z.object({
        question: z.string().describe("The exact examiner question to display in the exam panel"),
      }),
      handler: ({ question }) => {
        setCurrentQuestion(question);
        return Promise.resolve("ok");
      },
      render: ({ status, args, result }) => (
        <SpeakQuestionToolCall status={status} parameters={args ?? {}} result={result} />
      ),
    },
    [agentId],
  );

  return null;
}
