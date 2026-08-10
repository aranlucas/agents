"use client";

import { useEffect, useRef } from "react";
import {
  useAgent,
  useInterrupt,
  UseAgentUpdate,
  useDefaultRenderTool,
  useRenderTool,
} from "@copilotkit/react-core/v2";
import type { Interrupt } from "@copilotkit/react-core/v2";
import { z } from "zod";
import { Tool, ToolHeader } from "@agents/ui";
import { toToolState } from "@/components/chat/tool-adapter";
import { useOralBoardsQuestion } from "@/lib/copilotkit/oral-boards-question-context";
import { speakQuestion } from "@/lib/copilotkit/speak-question";
import type { AgentId } from "./registry";

type ToolStatus = "inProgress" | "executing" | "complete";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getCurrentQuestion(state: unknown) {
  if (!isRecord(state)) return undefined;
  return typeof state.current_question === "string" ? state.current_question : undefined;
}

function SetCaseToolCall({ status }: { status: ToolStatus }) {
  return (
    <Tool>
      <ToolHeader
        type="dynamic-tool"
        toolName="set_case"
        state={toToolState(status)}
        title="Composing case vignette"
      />
    </Tool>
  );
}

type RequestInputPayload = { kind: "ready" | "answer"; question: string };

function requestInputPayload(value: unknown): RequestInputPayload | null {
  if (!isRecord(value)) return null;
  const metadata = value.metadata;
  if (!isRecord(metadata) || !isRecord(metadata.payload)) return null;
  const { kind, question } = metadata.payload;
  if ((kind !== "ready" && kind !== "answer") || typeof question !== "string") return null;
  return { kind, question };
}

function RequestInputToolCall({
  interrupt,
  resolve,
}: {
  interrupt: Interrupt;
  resolve: (payload?: unknown, interruptId?: string) => Promise<unknown>;
}) {
  const { registerPendingInput, clearPendingInput } = useOralBoardsQuestion();
  const payload = requestInputPayload(interrupt);
  const id = interrupt.id;
  const kind = payload?.kind ?? "answer";
  const question = payload?.question ?? interrupt.message ?? "Please respond.";

  useEffect(() => {
    registerPendingInput({
      id,
      kind,
      question,
      respond: async (response) => {
        await resolve(response, id);
      },
    });
    return () => clearPendingInput(id);
  }, [id, kind, question, resolve, registerPendingInput, clearPendingInput]);

  // The bespoke exam panel already renders and speaks the active question.
  // Keep this component headless: AgentExtensionSlot is a direct child of the
  // flex workspace shell, so returning a Tool card here makes the interrupt
  // renderer occupy the viewport and cover the mobile answer composer.
  return null;
}

/**
 * Oral-boards console wiring. Resolves ADK graph RequestInput pauses and
 * mirrors workflow questions from shared state,
 * Internal retrieval calls stay hidden; a default fallback renders the
 * candidate-facing workflow tools.
 */
export function OralBoardsExtension({ agentId }: { agentId: AgentId }) {
  const { setCurrentQuestion } = useOralBoardsQuestion();
  const { agent } = useAgent({ agentId, updates: [UseAgentUpdate.OnStateChanged] });
  const lastSpokenQuestion = useRef("");
  const currentQuestion = getCurrentQuestion(agent?.state);

  // Seed the in-memory question context from agent state on mount / after
  // refresh, so the exam panel shows the last question without waiting for the
  // next ask_question tool call. append_exchange temporarily clears the backend
  // field while scoring; retain the displayed question through that transition
  // so the mobile surface does not collapse and rebuild after every answer.
  useEffect(() => {
    if (!currentQuestion) return;
    setCurrentQuestion(currentQuestion);
    if (currentQuestion !== lastSpokenQuestion.current) {
      lastSpokenQuestion.current = currentQuestion;
      void speakQuestion(currentQuestion);
    }
  }, [currentQuestion, setCurrentQuestion]);

  const interruptElement = useInterrupt({
    agentId,
    renderInChat: false,
    enabled: (event) => {
      return requestInputPayload(event.value) !== null;
    },
    render: ({ interrupt, resolve }) =>
      interrupt ? <RequestInputToolCall interrupt={interrupt} resolve={resolve} /> : <></>,
  });

  useRenderTool(
    {
      name: "search_docs",
      agentId,
      parameters: z.object({
        query: z.string(),
        collection: z.string().optional(),
      }),
      render: () => <></>,
    },
    [agentId],
  );

  useRenderTool(
    {
      name: "read_doc",
      agentId,
      parameters: z.object({
        filepath: z.string(),
      }),
      render: () => <></>,
    },
    [agentId],
  );

  useRenderTool(
    {
      name: "set_case",
      agentId,
      parameters: z.object({ case: z.string(), case_passages: z.array(z.string()).optional() }),
      render: ({ status }) => <SetCaseToolCall status={status} />,
    },
    [agentId],
  );

  useDefaultRenderTool(undefined, [agentId]);

  return interruptElement ?? null;
}
