import { describe, expect, it, vi } from "vitest";

import { RESUME_INTRODUCTION_PROMPT, runResumeIntroduction } from "./resume-introduction";

type RunInput = {
  threadId: string;
  runId: string;
  messages: Array<{ content: string }>;
};

function parseRunInput(body: RequestInit["body"]): RunInput {
  if (typeof body !== "string") throw new Error("Expected a JSON request body");
  return JSON.parse(body) as RunInput;
}

function aguiResponse(input: RunInput, deltas: string[]) {
  const messageId = "introduction-message";
  const events = [
    { type: "RUN_STARTED", threadId: input.threadId, runId: input.runId },
    { type: "TEXT_MESSAGE_START", messageId, role: "assistant" },
    ...deltas.map((delta) => ({ type: "TEXT_MESSAGE_CONTENT", messageId, delta })),
    { type: "TEXT_MESSAGE_END", messageId },
    { type: "RUN_FINISHED", threadId: input.threadId, runId: input.runId },
  ];
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const body = events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("");
      const split = Math.floor(body.length / 2);
      controller.enqueue(encoder.encode(body.slice(0, split)));
      controller.enqueue(encoder.encode(body.slice(split)));
      controller.close();
    },
  });

  return new Response(stream, { headers: { "Content-Type": "text/event-stream" } });
}

describe("Resume AG-UI client", () => {
  it("uses HttpAgent for the request, SSE decoding, and typed text events", async () => {
    let request: RunInput | undefined;
    const fetch = vi.fn(async (_url: string, init: RequestInit) => {
      request = parseRunInput(init.body);
      return aguiResponse(request, ["Hello", " from AG-UI."]);
    });
    const onDelta = vi.fn();

    const text = await runResumeIntroduction({
      baseUrl: "https://gateway.example///",
      token: "clerk-token",
      abortController: new AbortController(),
      onDelta,
      fetch,
    });

    expect(text).toBe("Hello from AG-UI.");
    expect(onDelta).toHaveBeenNthCalledWith(1, "Hello", "Hello");
    expect(onDelta).toHaveBeenNthCalledWith(2, " from AG-UI.", "Hello from AG-UI.");
    expect(fetch).toHaveBeenCalledWith(
      "https://gateway.example/agent/resume/suggest",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Accept: "text/event-stream",
          Authorization: "Bearer clerk-token",
          "Content-Type": "application/json",
        }),
      }),
    );
    expect(request?.threadId).toMatch(/^homepage-/);
    expect(request?.messages[0]?.content).toBe(RESUME_INTRODUCTION_PROMPT);
  });

  it("surfaces an AG-UI RUN_ERROR instead of leaving the introduction pending", async () => {
    const fetch = vi.fn(async (_url: string, init: RequestInit) => {
      const input = parseRunInput(init.body);
      const events = [
        { type: "RUN_STARTED", threadId: input.threadId, runId: input.runId },
        { type: "RUN_ERROR", message: "provider unavailable", code: "provider_error" },
      ];
      return new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""), {
        headers: { "Content-Type": "text/event-stream" },
      });
    });

    await expect(
      runResumeIntroduction({
        baseUrl: "https://gateway.example",
        token: null,
        abortController: new AbortController(),
        fetch,
      }),
    ).rejects.toThrow("provider unavailable");
  });
});
