"use client";

import { useEffect, useRef } from "react";
import {
  useAgent,
  UseAgentUpdate,
  useDefaultRenderTool,
  useFrontendTool,
  useRenderTool,
} from "@copilotkit/react-core/v2";
import { z } from "zod";
import type { OralBoardsState } from "@agents/types";

import { Badge, Tool, ToolContent, ToolHeader } from "@agents/ui";
import { SpeakQuestionToolCall } from "@/components/chat/speak-question-tool-call";
import { toToolState } from "@/components/chat/tool-adapter";
import { useOralBoardsQuestion } from "@/lib/copilotkit/oral-boards-question-context";
import { speakQuestion } from "@/lib/copilotkit/speak-question";
import type { AgentId } from "./registry";

type ToolStatus = "inProgress" | "executing" | "complete";
type SearchResult = { title: string; collection: string; snippet: string };
type SearchOutput = { results?: SearchResult[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getCurrentQuestion(state: unknown) {
  if (!isRecord(state)) return undefined;
  return typeof state.current_question === "string" ? state.current_question : undefined;
}

function isSearchResult(value: unknown): value is SearchResult {
  return (
    isRecord(value) &&
    typeof value.title === "string" &&
    typeof value.collection === "string" &&
    typeof value.snippet === "string"
  );
}

function parseSearchOutput(result: string | undefined): SearchOutput {
  if (!result) return {};

  try {
    const parsed: unknown = JSON.parse(result);
    if (!isRecord(parsed) || !Array.isArray(parsed.results)) return {};
    return { results: parsed.results.filter(isSearchResult) };
  } catch {
    return {};
  }
}

function SearchDocsToolCall({
  status,
  query,
  collection,
  results,
}: {
  status: ToolStatus;
  query?: string;
  collection?: string;
  results?: Array<{ title: string; collection: string; snippet: string }>;
}) {
  const label = [query, collection ? collection.toUpperCase() : ""].filter(Boolean).join(" · ");
  return (
    <Tool>
      <ToolHeader
        type="dynamic-tool"
        toolName="search_docs"
        state={toToolState(status)}
        title={label || "search_docs"}
      />
      {status === "complete" && results && results.length > 0 && (
        <ToolContent>
          <div className="space-y-1.5 border-t px-3 py-2.5">
            {results.slice(0, 5).map((r, i) => (
              // oxlint-disable-next-line react/no-array-index-key -- result list has no stable id
              <div key={i} className="space-y-0.5">
                <div className="flex items-center gap-1.5">
                  <Badge variant="secondary" className="font-mono text-[10px]">
                    {r.collection.toUpperCase()}
                  </Badge>
                  <span className="truncate text-xs font-medium">{r.title}</span>
                </div>
                {r.snippet && (
                  <p className="text-muted-foreground line-clamp-2 pl-0.5 text-[11px] leading-snug">
                    {r.snippet}
                  </p>
                )}
              </div>
            ))}
            {results.length > 5 && (
              <p className="text-muted-foreground text-[11px]">+{results.length - 5} more</p>
            )}
          </div>
        </ToolContent>
      )}
    </Tool>
  );
}

function ReadDocToolCall({ status, filepath }: { status: ToolStatus; filepath?: string }) {
  const name = filepath ? (filepath.split("/").pop() ?? filepath) : "document";
  return (
    <Tool>
      <ToolHeader
        type="dynamic-tool"
        toolName="read_doc"
        state={toToolState(status)}
        title={name}
      />
    </Tool>
  );
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

/**
 * Oral-boards console wiring. Registers the legacy prompt agent's
 * `ask_question` frontend tool and mirrors workflow questions from shared state,
 * plus tool-call renderers for search_docs / read_doc (grounding transparency)
 * and a default fallback for all other agent tool calls.
 */
export function OralBoardsExtension({ agentId }: { agentId: AgentId }) {
  const { setCurrentQuestion, clearCurrentQuestion } = useOralBoardsQuestion();
  const { agent } = useAgent({ agentId, updates: [UseAgentUpdate.OnStateChanged] });
  const lastSpokenQuestion = useRef("");
  const currentQuestion = getCurrentQuestion(agent?.state);

  // Seed the in-memory question context from agent state on mount / after
  // refresh, so the exam panel shows the last question without waiting for the
  // next ask_question tool call. Also clear it when state's current_question
  // goes empty (e.g. append_exchange resets it while scoring), so the panel
  // doesn't keep showing an already-answered question.
  useEffect(() => {
    if (!currentQuestion) {
      clearCurrentQuestion();
      lastSpokenQuestion.current = "";
      return;
    }
    setCurrentQuestion(currentQuestion);
    if (currentQuestion !== lastSpokenQuestion.current) {
      lastSpokenQuestion.current = currentQuestion;
      void speakQuestion(currentQuestion);
    }
  }, [currentQuestion, setCurrentQuestion, clearCurrentQuestion]);

  useFrontendTool(
    {
      name: "ask_question",
      agentId,
      description: "Display and speak the current oral-board question in the exam panel.",
      available: true,
      parameters: z.object({
        kind: z
          .enum(["ready", "answer"])
          .describe("Whether the UI is waiting to begin or waiting for a clinical answer"),
        question: z.string().describe("The exact prompt to display in the oral-board panel"),
      }),
      handler: async ({ question }) => {
        setCurrentQuestion(question);
        lastSpokenQuestion.current = question;
        await speakQuestion(question);
        agent?.setState({
          ...(isRecord(agent.state) ? agent.state : {}),
          current_question: question,
        } satisfies OralBoardsState);
        return "Question is displayed in the exam panel";
      },
      render: ({ status, args, result }) =>
        args?.kind === "answer" ? (
          <SpeakQuestionToolCall
            status={status}
            parameters={{ question: args.question }}
            result={result}
          />
        ) : null,
    },
    [agentId],
  );

  useRenderTool(
    {
      name: "search_docs",
      agentId,
      parameters: z.object({
        query: z.string(),
        collection: z.string().optional(),
      }),
      render: ({ status, parameters, result }) => {
        const parsed = parseSearchOutput(result);
        return (
          <SearchDocsToolCall
            status={status}
            query={parameters?.query}
            collection={parameters?.collection}
            results={parsed.results}
          />
        );
      },
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
      render: ({ status, parameters }) => (
        <ReadDocToolCall status={status} filepath={parameters?.filepath} />
      ),
    },
    [agentId],
  );

  useRenderTool(
    {
      name: "set_case",
      agentId,
      parameters: z.object({ case: z.string(), case_sources: z.array(z.unknown()).optional() }),
      render: ({ status }) => <SetCaseToolCall status={status} />,
    },
    [agentId],
  );

  useDefaultRenderTool(undefined, [agentId]);

  return null;
}
