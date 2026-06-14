"use client";

import { useFrontendTool } from "@copilotkit/react-core/v2";
import { z } from "zod";

import { SpeakQuestionToolCall } from "@/components/chat/SpeakQuestionToolCall";
import { speakQuestion } from "@/lib/copilotkit/speak-question";
import type { AgentId } from "./registry";

/**
 * Oral-boards console wiring. Registers the `speak_question` frontend tool that
 * voices examiner prompts. The Kokoro TTS model is preloaded earlier by the
 * route layout so the first question speaks without a cold-start stall.
 */
export function OralBoardsExtension({ agentId }: { agentId: AgentId }) {
  useFrontendTool(
    {
      name: "speak_question",
      description:
        "Speak the next oral boards examiner question aloud in the chat UI and explain why it is being asked.",
      available: true,
      agentId,
      parameters: z.object({
        question: z.string().describe("The exact examiner question to speak aloud"),
        purpose: z
          .string()
          .describe("Why this question is being asked in the oral-board flow")
          .optional(),
        evaluationFocus: z
          .string()
          .describe("The clinical reasoning or ABPD competency being evaluated")
          .optional(),
        sourceBasis: z
          .string()
          .describe("The source document, guideline, or case fact that motivated the question")
          .optional(),
      }),
      handler: ({ question }) => speakQuestion(question),
      render: ({ status, args, result }) => (
        <SpeakQuestionToolCall status={status} parameters={args ?? {}} result={result} />
      ),
    },
    [agentId],
  );

  return null;
}
