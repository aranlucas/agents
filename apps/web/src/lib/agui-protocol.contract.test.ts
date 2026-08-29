import { HttpAgent } from "@ag-ui/client";
import { describe, expect, it } from "vitest";

function agentFor(events: object[]) {
  const body = events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("");
  return new HttpAgent({
    threadId: "thread-1",
    url: "https://example.invalid/agent",
    fetch: async () =>
      new Response(body, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      }),
  });
}

describe("Go gateway AG-UI stream contract", () => {
  it("applies text and its correlated tool call to one assistant message", async () => {
    const agent = agentFor([
      { type: "RUN_STARTED", threadId: "thread-1", runId: "run-1" },
      { type: "TEXT_MESSAGE_START", messageId: "message-1", role: "assistant" },
      { type: "TEXT_MESSAGE_CONTENT", messageId: "message-1", delta: "I will check." },
      { type: "TEXT_MESSAGE_END", messageId: "message-1" },
      {
        type: "TOOL_CALL_START",
        toolCallId: "call-1",
        toolCallName: "lookup",
        parentMessageId: "message-1",
      },
      { type: "TOOL_CALL_ARGS", toolCallId: "call-1", delta: '{"id":1}' },
      { type: "TOOL_CALL_END", toolCallId: "call-1" },
      { type: "RUN_FINISHED", threadId: "thread-1", runId: "run-1" },
    ]);

    await agent.runAgent({ runId: "run-1" });

    expect(agent.messages).toHaveLength(1);
    expect(agent.messages[0]).toMatchObject({
      id: "message-1",
      role: "assistant",
      content: "I will check.",
      toolCalls: [{ id: "call-1", function: { name: "lookup", arguments: '{"id":1}' } }],
    });
  });

  it("rejects an event after either terminal lifecycle event", async () => {
    for (const terminal of [
      { type: "RUN_ERROR", message: "failed", code: "internal_error" },
      { type: "RUN_FINISHED", threadId: "thread-1", runId: "run-1" },
    ]) {
      const agent = agentFor([
        { type: "RUN_STARTED", threadId: "thread-1", runId: "run-1" },
        terminal,
        { type: "STATE_SNAPSHOT", snapshot: {} },
      ]);
      await expect(agent.runAgent({ runId: "run-1" })).rejects.toThrow();
    }
  });
});
