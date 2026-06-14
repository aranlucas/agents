"use client";

import { useFrontendTool } from "@copilotkit/react-core/v2";
import { z } from "zod";

import { SpeakQuestionToolCall } from "@/components/chat/SpeakQuestionToolCall";
import { speak } from "@/lib/copilotkit/speak-question";
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
      description: "Speak the next oral boards examiner question aloud in the chat UI.",
      available: true,
      agentId,
      parameters: z.object({
        question: z.string().describe("The exact examiner question to speak aloud"),
      }),
      handler: ({ question }) => {
        setCurrentQuestion(question);
        return speak(question);
      },
      render: ({ status, args, result }) => (
        <SpeakQuestionToolCall status={status} parameters={args ?? {}} result={result} />
      ),
    },
    [agentId],
  );

  return null;
}
