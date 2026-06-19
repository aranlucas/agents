"use client";

import { useEffect } from "react";
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
import type { AgentId } from "./registry";

type ToolStatus = "inProgress" | "executing" | "complete";

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
 * Oral-boards console wiring. Registers the `ask_question` frontend tool that
 * voices examiner prompts and captures the live question for the bespoke pane,
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
    const q = (agent?.state as OralBoardsState | undefined)?.current_question;
    if (q) setCurrentQuestion(q);
  }, [agent, setCurrentQuestion]);

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
        // Persist to agent state so the question survives a page refresh.
        agent?.setState({ ...(agent.state as OralBoardsState), current_question: question });
        return Promise.resolve("Question is displayed in the exam panel");
      },
      render: ({ status, args, result }) => (
        <SpeakQuestionToolCall status={status} parameters={args ?? {}} result={result} />
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
        type SearchResult = { title: string; collection: string; snippet: string };
        type SearchOutput = { results?: SearchResult[] };
        // result is a JSON string when status === "complete"
        const parsed: SearchOutput = result ? (JSON.parse(result) as SearchOutput) : {};
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
