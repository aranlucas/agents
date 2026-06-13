"use client";

import { useEffect } from "react";
import ReactDOM from "react-dom";
import { useFrontendTool } from "@copilotkit/react-core/v2";
import { z } from "zod";

import { SpeakQuestionToolCall } from "@/components/chat/SpeakQuestionToolCall";
import { preloadKokoro, speakQuestion } from "@/lib/copilotkit/speak-question";
import type { AgentId } from "./registry";

/**
 * Oral-boards console wiring. Registers the `speak_question` frontend tool that
 * voices examiner prompts, and warms the local Kokoro TTS model the moment the
 * examinee opens the console — so the first question speaks without the
 * cold-start download/compile stall (rather than blocking on the first call).
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

  // Warm the TTS model on entry instead of on the first spoken question. The
  // expensive part is the model weights (~80 MB from the Hugging Face CDN), so
  // first warm the connection (React 19 / Next resource hint) and then kick off
  // the download. Fire and forget — speakQuestion shares the same memoized model
  // and falls back to browser speech synthesis if this never completes.
  useEffect(() => {
    ReactDOM.preconnect("https://huggingface.co");
    ReactDOM.preconnect("https://cdn-lfs.huggingface.co");
    void preloadKokoro();
  }, []);

  return null;
}
