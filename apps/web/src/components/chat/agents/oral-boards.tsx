"use client";

import { useEffect, useId } from "react";
import {
  useAgent,
  UseAgentUpdate,
  useDefaultRenderTool,
  useHumanInTheLoop,
  useRenderTool,
} from "@copilotkit/react-core/v2";
import { z } from "zod";

import { Badge, Tool, ToolContent, ToolHeader } from "@agents/ui";
import { SpeakQuestionToolCall } from "@/components/chat/speak-question-tool-call";
import { toToolState } from "@/components/chat/tool-adapter";
import { useOralBoardsQuestion } from "@/lib/copilotkit/oral-boards-question-context";
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

// Bridges CopilotKit's HITL renderer into the bespoke exam panel. The tool call
// stays pending until that panel invokes the registered `respond` callback.
function AskQuestionToolCall({
  status,
  kind,
  question,
  respond,
  result,
}: {
  status: ToolStatus;
  kind?: "ready" | "answer";
  question?: string;
  respond?: (response: { answer: string }) => void | Promise<void>;
  result?: string;
}) {
  const requestId = useId();
  const { registerPendingInput, clearPendingInput } = useOralBoardsQuestion();

  useEffect(() => {
    if (status === "executing" && kind && question && respond) {
      registerPendingInput({
        id: requestId,
        kind,
        question,
        respond,
      });
    }

    return () => clearPendingInput(requestId);
  }, [status, kind, question, respond, requestId, registerPendingInput, clearPendingInput]);

  if (kind !== "answer") return null;
  return <SpeakQuestionToolCall status={status} parameters={{ question }} result={result} />;
}

/**
 * Oral-boards console wiring. Registers the `ask_question` HITL tool that
 * pauses the examiner until the bespoke pane submits the candidate's response,
 * plus tool-call renderers for search_docs / read_doc (grounding transparency)
 * and a default fallback for all other agent tool calls.
 */
export function OralBoardsExtension({ agentId }: { agentId: AgentId }) {
  const { setCurrentQuestion } = useOralBoardsQuestion();
  const { agent } = useAgent({ agentId, updates: [UseAgentUpdate.OnStateChanged] });

  // Seed the in-memory question context from agent state on mount / after
  // refresh, so the exam panel shows the last question without waiting for the
  // next ask_question tool call.
  useEffect(() => {
    const q = getCurrentQuestion(agent?.state);
    if (q) setCurrentQuestion(q);
  }, [agent, setCurrentQuestion]);

  useHumanInTheLoop(
    {
      name: "ask_question",
      agentId,
      description:
        "Pause the oral-board examination and wait for the candidate's response in the exam panel. " +
        "Use kind='ready' after presenting a case and kind='answer' for each clinical question. " +
        "Returns { answer: string }.",
      parameters: z.object({
        kind: z
          .enum(["ready", "answer"])
          .describe("Whether the UI is waiting to begin or waiting for a clinical answer"),
        question: z.string().describe("The exact prompt to display in the oral-board panel"),
      }),
      render: ({ status, args, respond, result }) => (
        <AskQuestionToolCall
          status={status}
          kind={args?.kind}
          question={args?.question}
          respond={respond}
          result={result}
        />
      ),
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
