// @vitest-environment jsdom
import { StrictMode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { getToken } = vi.hoisted(() => ({ getToken: vi.fn(async () => "clerk-token") }));

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ getToken, isLoaded: true }),
}));

vi.mock("@/env", () => ({
  env: { NEXT_PUBLIC_AGENTS_BASE_URL: "https://gateway.example" },
}));

import {
  IntroductionContent,
  IntroductionSkeleton,
  StreamingIntroduction,
} from "./streaming-introduction";

type RunInput = { threadId: string; runId: string };

function parseRunInput(body: RequestInit["body"]): RunInput {
  if (typeof body !== "string") throw new Error("Expected a JSON request body");
  return JSON.parse(body) as RunInput;
}

function event(input: RunInput, payload: Record<string, unknown>) {
  return new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`);
}

function installStreamingResponse() {
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
  let input: RunInput | undefined;
  const fetch = vi.fn(async (_url: string, init: RequestInit) => {
    input = parseRunInput(init.body);
    return new Response(
      new ReadableStream<Uint8Array>({
        start(streamController) {
          controller = streamController;
        },
      }),
      { headers: { "Content-Type": "text/event-stream" } },
    );
  });
  vi.stubGlobal("fetch", fetch);

  return {
    fetch,
    async ready() {
      await waitFor(() => expect(controller).toBeDefined());
      return { controller: controller!, input: input! };
    },
  };
}

function enqueueSuccessfulRun(
  controller: ReadableStreamDefaultController<Uint8Array>,
  input: RunInput,
  deltas: string[],
) {
  const messageId = "introduction-message";
  controller.enqueue(
    event(input, { type: "RUN_STARTED", threadId: input.threadId, runId: input.runId }),
  );
  controller.enqueue(event(input, { type: "TEXT_MESSAGE_START", messageId, role: "assistant" }));
  for (const delta of deltas) {
    controller.enqueue(event(input, { type: "TEXT_MESSAGE_CONTENT", messageId, delta }));
  }
  controller.enqueue(event(input, { type: "TEXT_MESSAGE_END", messageId }));
  controller.enqueue(
    event(input, { type: "RUN_FINISHED", threadId: input.threadId, runId: input.runId }),
  );
  controller.close();
}

afterEach(() => {
  vi.unstubAllGlobals();
  getToken.mockClear();
});

describe("GeneratedIntroduction", () => {
  it("reserves the same frame height while writing and once ready", () => {
    const writing = render(<IntroductionSkeleton />).container;
    const ready = render(<IntroductionContent text="Done." />).container;

    for (const frame of [writing.querySelector(".min-h-80"), ready.querySelector(".min-h-80")]) {
      expect(frame).toHaveClass("mt-5", "min-h-80", "sm:min-h-64");
    }
  });

  it("labels the run that writes the introduction", () => {
    const writing = render(<IntroductionSkeleton />).container;
    expect(writing).toHaveTextContent("resume-agent");
    expect(writing).toHaveTextContent("writing");

    const ready = render(<IntroductionContent text="Done." />).container;
    expect(ready).toHaveTextContent("resume-agent");
    expect(ready).toHaveTextContent("ready");
  });

  it("renders a generated introduction as paragraphs", () => {
    const view = render(
      <IntroductionContent
        text={"I build products from idea to launch.\n\nOutside work, I build agents and climb."}
      />,
    );

    expect(view.container.querySelectorAll("p")).toHaveLength(2);
    expect(screen.getByText("I build products from idea to launch.")).toBeVisible();
    expect(screen.getByText("Outside work, I build agents and climb.")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("Resume introduction ready");
  });

  it("streams typed HttpAgent text events directly from the gateway", async () => {
    const request = installStreamingResponse();
    render(<StreamingIntroduction />);

    expect(screen.getByLabelText("Resume agent is writing")).toBeVisible();
    const { controller, input } = await request.ready();
    const messageId = "introduction-message";
    controller.enqueue(
      event(input, { type: "RUN_STARTED", threadId: input.threadId, runId: input.runId }),
    );
    controller.enqueue(event(input, { type: "TEXT_MESSAGE_START", messageId, role: "assistant" }));
    controller.enqueue(
      event(input, { type: "TEXT_MESSAGE_CONTENT", messageId, delta: "Fresh introduction" }),
    );
    expect(await screen.findByText("Fresh introduction")).toBeVisible();

    controller.enqueue(
      event(input, { type: "TEXT_MESSAGE_CONTENT", messageId, delta: " streams in." }),
    );
    controller.enqueue(event(input, { type: "TEXT_MESSAGE_END", messageId }));
    controller.enqueue(
      event(input, { type: "RUN_FINISHED", threadId: input.threadId, runId: input.runId }),
    );
    controller.close();

    expect(await screen.findByText("Fresh introduction streams in.")).toBeVisible();
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Resume introduction ready"),
    );
    expect(request.fetch).toHaveBeenCalledWith(
      "https://gateway.example/agent/resume/suggest",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer clerk-token" }),
      }),
    );
  });

  it("restarts safely during the Strict Mode effect probe", async () => {
    const request = installStreamingResponse();
    render(
      <StrictMode>
        <StreamingIntroduction />
      </StrictMode>,
    );

    const { controller, input } = await request.ready();
    enqueueSuccessfulRun(controller, input, ["Strict-safe introduction"]);

    expect(await screen.findByText("Strict-safe introduction")).toBeVisible();
  });
});
